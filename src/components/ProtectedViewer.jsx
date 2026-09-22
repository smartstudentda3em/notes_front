import { useEffect, useRef, useState } from 'react';
import { fetchViewerMeta, fetchViewerPage } from '../api/client.js';

/**
 * عارض مذكرة محمي للمشاهد المقيّد: يعرض كل صفحة كصورة PNG مختومة بعلامة مائية
 * (اسم المشاهد، من الخادم) مرسومة على <canvas> — لا ملف PDF، لا رابط مباشر، لا تنزيل.
 *
 * الأداء: كاش صور الصفحات في الذاكرة + جلب مسبق (prefetch) للصفحة التالية/السابقة،
 * فيصبح التنقّل فورياً بعد أول عرض.
 * طبقات ردع: منع كليك-يمين، منع التحديد/السحب، منع Ctrl+P/S/C/U وتفريغ الطباعة.
 */
export default function ProtectedViewer({ documentId, title, onClose }) {
  const canvasRef = useRef(null);
  const cacheRef = useRef(new Map()); // page -> { url, img }
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // منع اختصارات الحفظ/الطباعة/النسخ + تفريغ الطباعة أثناء فتح العارض
  useEffect(() => {
    const onKey = (e) => {
      const k = (e.key || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ['p', 's', 'c', 'u'].includes(k)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const blockPrint = (e) => e.preventDefault();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('beforeprint', blockPrint);
    document.body.classList.add('viewer-open');
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('beforeprint', blockPrint);
      document.body.classList.remove('viewer-open');
    };
  }, []);

  // تفريغ كاش الصور عند تغيير المذكرة أو عند الخروج
  useEffect(() => {
    const cache = cacheRef.current;
    return () => {
      cache.forEach((e) => { try { URL.revokeObjectURL(e.url); } catch (_) { /* */ } });
      cache.clear();
    };
  }, [documentId]);

  // جلب صفحة (مع الكاش) — يعيد {url, img} جاهزاً للرسم
  async function getPage(p) {
    const cache = cacheRef.current;
    if (cache.has(p)) return cache.get(p);
    const blob = await fetchViewerPage(documentId, p);
    const url = URL.createObjectURL(blob);
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('تعذّر عرض الصفحة.'));
      im.src = url;
    });
    const entry = { url, img };
    cache.set(p, entry);
    return entry;
  }

  // جلب عدد الصفحات
  useEffect(() => {
    let alive = true;
    setError(''); setLoading(true);
    fetchViewerMeta(documentId)
      .then((m) => { if (alive) { setPages(m.pages || 0); setPage(1); } })
      .catch((e) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [documentId]);

  // رسم الصفحة الحالية + جلب مسبق للجيران
  useEffect(() => {
    if (!pages) return;
    let alive = true;
    setLoading(true); setError('');

    getPage(page)
      .then((entry) => {
        if (!alive) return;
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = entry.img.naturalWidth;
          canvas.height = entry.img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(entry.img, 0, 0);
        }
        // جلب مسبق للتالي والسابق (بلا انتظار) — تنقّل فوري لاحقاً
        [page + 1, page - 1].forEach((p) => {
          if (p >= 1 && p <= pages) getPage(p).catch(() => {});
        });
      })
      .catch((e) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });

    return () => { alive = false; };
  }, [documentId, page, pages]);

  const go = (d) => setPage((p) => Math.min(pages || 1, Math.max(1, p + d)));

  return (
    <div
      className="pv-overlay"
      onContextMenu={(e) => e.preventDefault()}
      role="dialog"
      aria-label="عارض المذكرة"
    >
      <div className="pv-head">
        <div className="pv-title">{title || 'مذكرة'}</div>
        <div className="pv-nav">
          <button className="btn ghost sm" onClick={() => go(-1)} disabled={page <= 1}>‹ السابق</button>
          <span className="pv-page">{pages ? `${page} / ${pages}` : '—'}</span>
          <button className="btn ghost sm" onClick={() => go(1)} disabled={!pages || page >= pages}>التالي ›</button>
          <button className="btn sm" onClick={onClose}>إغلاق</button>
        </div>
      </div>

      <div className="pv-stage">
        {error
          ? <div className="pv-msg danger">{error}</div>
          : (
            <div className="pv-canvas-wrap">
              <canvas ref={canvasRef} className="pv-canvas" />
              {loading && <div className="pv-loading">جارٍ التحميل…</div>}
            </div>
          )}
      </div>
    </div>
  );
}
