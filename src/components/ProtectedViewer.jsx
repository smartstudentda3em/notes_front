import { useEffect, useRef, useState } from 'react';
import { fetchViewerMeta, fetchViewerPage } from '../api/client.js';

/**
 * عارض مذكرة محمي للمشاهد المقيّد: يعرض كل صفحة كصورة PNG (مختومة بعلامة مائية من
 * الخادم) مرسومة على <canvas> — لا ملف PDF كامل، لا رابط مباشر، لا زر تنزيل/طباعة.
 * طبقات ردع: منع كليك-يمين، منع التحديد/السحب، منع Ctrl+P/S/C وتفريغ الطباعة،
 * وعلامة مائية أمامية إضافية (اسم + هاتف) فوق الصورة.
 */
export default function ProtectedViewer({ documentId, title, viewerName, viewerPhone, onClose }) {
  const canvasRef = useRef(null);
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
    const blockPrint = (e) => { e.preventDefault(); };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('beforeprint', blockPrint);
    document.body.classList.add('viewer-open');
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('beforeprint', blockPrint);
      document.body.classList.remove('viewer-open');
    };
  }, []);

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

  // رسم الصفحة الحالية على الـ canvas
  useEffect(() => {
    if (!pages) return;
    let alive = true;
    let objectUrl = null;
    setLoading(true); setError('');

    fetchViewerPage(documentId, page)
      .then((blob) => new Promise((resolve, reject) => {
        if (!alive) return resolve();
        objectUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          if (canvas) {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
          }
          resolve();
        };
        img.onerror = () => reject(new Error('تعذّر عرض الصفحة.'));
        img.src = objectUrl;
      }))
      .catch((e) => { if (alive) setError(e.message); })
      .finally(() => {
        if (alive) setLoading(false);
        if (objectUrl) URL.revokeObjectURL(objectUrl); // لا يبقى في الذاكرة
      });

    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
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
              {/* علامة مائية أمامية إضافية (تعزّز المحروقة داخل الصورة) */}
              <div className="pv-watermark" aria-hidden="true">
                {Array.from({ length: 40 }).map((_, i) => (
                  <span key={i}>{viewerName} · {viewerPhone}</span>
                ))}
              </div>
              {loading && <div className="pv-loading">جارٍ التحميل…</div>}
            </div>
          )}
      </div>
    </div>
  );
}
