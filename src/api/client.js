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
export async function fetchDocumentBlob(documentId, { admin = false, copies = 1 } = {}) {
  const token = tokenStore.get();
  const path = admin ? `/admin/documents/${documentId}/stream` : `/documents/${documentId}/stream`;
  const base = `${path}?copies=${encodeURIComponent(copies)}`;
  const res = await fetch(`${API_URL}${base}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/pdf',
    },
  });

  if (!res.ok) throw new Error('تعذّر جلب الملف للطباعة.');

  return await res.blob(); // application/pdf
}
