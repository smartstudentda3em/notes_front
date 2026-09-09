const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const TOKEN_KEY = 'memos_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/** طلب JSON عام مع إرفاق توكن Sanctum (Bearer) في كل طلب. */
export async function api(path, opts = {}) {
  return request(path, opts, false);
}

async function request(path, { method = 'GET', body, isForm = false } = {}, retried) {
  // قراءة التوكن طازجاً عند كل محاولة (يلتقط أي تجديد للرمز)
  const headers = { Accept: 'application/json' };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload = body;
  if (body && !isForm) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${API_URL}${path}`, { method, headers, body: payload });

  // 401: إعادة محاولة واحدة برمز محدّث (يعالج سباق التجديد والانقطاعات العابرة)
  if (res.status === 401 && !retried && path !== '/login' && path !== '/refresh-token') {
    await new Promise((r) => setTimeout(r, 300));
    return request(path, { method, body, isForm }, true);
  }
  // إن استمر 401 → الجلسة انتهت فعلاً: تنظيف + إشعار الواجهة
  if (res.status === 401) {
    tokenStore.clear();
    window.dispatchEvent(new Event('memos:unauthorized'));
  }

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const firstError = data.errors ? Object.values(data.errors)[0]?.[0] : null;
    throw new Error(firstError || data.message || 'حدث خطأ في الطلب.');
  }
  return data;
}

/**
 * جلب ملف المذكرة كـ Blob Stream (PDF أصلي) مع توكن المطبعة.
 * ملاحظة مهمة: الطلب يتم عبر fetch (يحمل الـ Bearer) وليس عبر src للـ iframe،
 * لذلك لا يُكشف رابط قابل للتنزيل، ونحافظ على جودة الـ Vector الأصلية.
 */
/**
 * رفع ملف (multipart) عبر XMLHttpRequest للحصول على مؤشّر تقدّم حقيقي.
 * fetch لا يدعم أحداث تقدّم الرفع، لذا نستخدم XHR لإظهار النسبة للمستخدم
 * بدلاً من زر متجمّد أثناء رفع ملفات PDF الكبيرة.
 */
export function uploadFile(path, formData, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}${path}`);

    const token = tokenStore.get();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Accept', 'application/json');
    // لا نضبط Content-Type يدوياً: XHR يضيف حدّ الـ multipart boundary تلقائياً.

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* قد يكون الردّ فارغاً */ }

      if (xhr.status >= 200 && xhr.status < 300) return resolve(data);

      if (xhr.status === 401) {
        tokenStore.clear();
        window.dispatchEvent(new Event('memos:unauthorized'));
      }
      const firstError = data.errors ? Object.values(data.errors)[0]?.[0] : null;
      reject(new Error(firstError || data.message || 'تعذّر رفع الملف.'));
    };

    xhr.onerror = () => reject(new Error('انقطع الاتصال أثناء الرفع. تحقّق من الشبكة وحاول مجدداً.'));
    xhr.ontimeout = () => reject(new Error('انتهت مهلة الرفع. حاول بملف أصغر أو باتصال أفضل.'));

    xhr.send(formData);
  });
}

// حجم الجزء الواحد عند التحميل. صغير عمداً: تحميل ملف كبير (10+ ميجا) دفعةً
// واحدة يُقطع على الشبكات الضعيفة/خلف بروكسي فحص فيظهر "Failed to fetch"،
// بينما الأجزاء الصغيرة تنجح ثم نجمّعها.
const PDF_CHUNK = 2 * 1024 * 1024; // 2MB

/**
 * تحميل مذكرة PDF للطباعة على أجزاء عبر طلبات النطاق (HTTP Range).
 *
 * السبب: على شبكات المستخدمين قد يفشل تحميل الملف الكبير دفعةً واحدة
 * ("Failed to fetch")؛ فنحمّله على قطع صغيرة (كل قطعة تنجح) ثم نبني Blob
 * واحداً بنوع application/pdf. الـ Blob محلي (blob:) على نفس أصل الصفحة،
 * فتعمل الطباعة المباشرة داخل iframe دون كشف رابط قابل للتنزيل/المشاركة.
 *
 * onProgress(loaded, total): اختياري لتحديث مؤشّر التقدّم.
 */
export async function fetchDocumentBlob(documentId, { admin = false, copies = 1, onProgress } = {}) {
  const token = tokenStore.get();
  const path = admin ? `/admin/documents/${documentId}/stream` : `/documents/${documentId}/stream`;
  const url = `${API_URL}${path}?copies=${encodeURIComponent(copies)}`;
  const auth = { Authorization: `Bearer ${token}` };

  // طلب نطاق واحد مع إعادة محاولة (يعالج الانقطاعات العابرة)
  async function fetchRange(start, end) {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { ...auth, Range: `bytes=${start}-${end}` },
          cache: 'no-store',
        });
        if (res.status === 401) throw new Error('انتهت الجلسة. سجّل الدخول من جديد.');
        if (res.status !== 206 && res.status !== 200) throw new Error('تعذّر جلب الملف للطباعة.');
        return res;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    throw lastErr || new Error('تعذّر جلب الملف للطباعة.');
  }

  // الجزء الأول
  let res = await fetchRange(0, PDF_CHUNK - 1);

  // خادم لا يدعم النطاق → أعاد الملف كاملاً
  if (res.status === 200) {
    const buf = await res.arrayBuffer();
    return new Blob([buf], { type: 'application/pdf' });
  }

  // 206: احسب الحجم الكلي من Content-Range ثم أكمل باقي الأجزاء
  const cr = res.headers.get('Content-Range') || '';
  const total = parseInt(cr.split('/')[1], 10) || 0;
  const parts = [await res.arrayBuffer()];
  let start = parts[0].byteLength;
  onProgress && onProgress(start, total);

  while (total ? start < total : true) {
    res = await fetchRange(start, start + PDF_CHUNK - 1);
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) break;
    parts.push(buf);
    start += buf.byteLength;
    onProgress && onProgress(start, total);
    if (res.status === 200 || (!total && buf.byteLength < PDF_CHUNK)) break;
  }

  return new Blob(parts, { type: 'application/pdf' });
}
