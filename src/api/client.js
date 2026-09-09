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

/**
 * قاعدة تحميل ملف الـ PDF للطباعة.
 *
 * مهم: المتصفحات (Chrome/Edge) تحجب قراءة استجابة application/pdf عبر الأصول
 * عبر آلية ORB/CORB — حتى مع ترويسات CORS سليمة — فيظهر "Failed to fetch".
 * لذلك على الموقع المنشور نمرّ الطلب عبر بروكسي على *نفس أصل الموقع* (‎/pdf-api)
 * مُعرَّف في vercel.json، فيصبح الطلب same-origin ولا ينطبق عليه ORB إطلاقاً،
 * كما يبقى الـ Blob على نفس الأصل فتعمل الطباعة التلقائية داخل iframe.
 * محلياً (localhost) نستخدم قاعدة الـ API مباشرة.
 */
function pdfBase() {
  const local = typeof location !== 'undefined'
    && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  return local ? API_URL : '/pdf-api';
}

export async function fetchDocumentBlob(documentId, { admin = false, copies = 1 } = {}) {
  const token = tokenStore.get();
  const path = admin ? `/admin/documents/${documentId}/stream` : `/documents/${documentId}/stream`;
  const url = `${pdfBase()}${path}?copies=${encodeURIComponent(copies)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error('تعذّر جلب الملف للطباعة.');

  // نبني الـ Blob بنوع pdf صراحةً (الاستجابة عبر البروكسي قد تصل بنوع عام)
  const buf = await res.arrayBuffer();
  return new Blob([buf], { type: 'application/pdf' });
}
