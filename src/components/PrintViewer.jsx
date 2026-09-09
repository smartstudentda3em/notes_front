import { useEffect, useRef, useState } from 'react';
import { fetchDocumentBlob } from '../api/client.js';

/**
 * PrintViewer — تجهيز وطباعة مذكرة PDF.
 *
 * يجلب الـ PDF كـ Blob على أجزاء (HTTP Range) — يعالج فشل تحميل الملفات الكبيرة —
 * ثم يمرّره إلى iframe مخفي خارج الشاشة، ويطبع الملف الأصلي مباشرة (بلا ترسيم/تنزيل).
 *
 * لماذا زرّ طباعة صريح؟ التحميل يستغرق ثوانٍ، فيضيع "تفعيل المستخدم" (transient
 * activation) الناتج عن النقرة الأصلية؛ وEdge يخنق الطباعة التلقائية بلا تفعيل
 * فيُسقِط النداء بصمت (لا نافذة ولا خطأ). لذا:
 *   1) نحاول الطباعة تلقائياً فور الجهوزية (ينجح غالباً في Chrome)،
 *   2) ونعرض زر "اطبع المذكرة" الذي توفّر نقرته تفعيلاً طازجاً يفتح النافذة فوراً
 *      (المسار المضمون عبر كل المتصفحات) — دون كشف رابط قابل للتنزيل/المشاركة.
 */
export default function PrintViewer({ documentId, admin = false, copies = 1, onDone, onError }) {
  const iframeRef = useRef(null);
  const launchRef = useRef(null);
  const [pct, setPct] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    const timers = [];

    const launch = () => {
      const win = iframeRef.current && iframeRef.current.contentWindow;
      if (!win) return;
      try {
        win.focus(); // حاسم في Edge
        win.print(); // مسار PDFium الأصلي — جودة محفوظة، بلا زر تنزيل
      } catch (e) {
        /* قد يُخنَق بلا استثناء؛ الزر المرئي يبقى متاحاً للمستخدم */
      }
    };
    launchRef.current = launch;

    (async () => {
      try {
        const blob = await fetchDocumentBlob(documentId, {
          admin,
          copies,
          onProgress: (loaded, total) => {
            if (cancelled) return;
            if (total > 0) setPct(Math.min(100, Math.round((loaded / total) * 100)));
          },
        });
        if (cancelled) return;
        setPct(100);

        objectUrl = URL.createObjectURL(blob);
        const iframe = iframeRef.current;

        // مهلة تهيئة متدرّجة مع حجم الملف (عارض PDFium غير المتزامن يحتاج وقتاً أطول للملفات الكبيرة)
        const sizeMB = blob.size / (1024 * 1024);
        const baseDelay = Math.min(2600, 800 + Math.ceil(sizeMB) * 80);
        let viewerLoaded = false;

        iframe.onload = () => {
          viewerLoaded = true;
          // عند انتهاء نافذة الطباعة (في المتصفحات التي تُطلق afterprint) نُغلق الطبقة تلقائياً
          try {
            iframe.contentWindow.addEventListener('afterprint', () => {
              if (!cancelled) onDone && onDone();
            });
          } catch (_) { /* عابر للأصل أحياناً — نتجاهل */ }
        };
        iframe.src = objectUrl + '#toolbar=0&navpanes=0';

        // استطلاع الجاهزية ثم محاولة الطباعة التلقائية، مع إظهار زر الطباعة اليدوي كضمان
        const startedAt = Date.now();
        const poll = () => {
          if (cancelled) return;
          const waited = Date.now() - startedAt;
          if ((viewerLoaded && waited >= baseDelay) || waited > 8000) {
            setReady(true);       // يُظهر زر "اطبع المذكرة"
            launch();             // محاولة تلقائية (تنجح غالباً في Chrome)
            return;
          }
          timers.push(setTimeout(poll, 150));
        };
        poll();
      } catch (e) {
        if (!cancelled) onError && onError(e.message);
      }
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    };
  }, [documentId]);

  return (
    <div className="print-overlay" role="dialog" aria-live="polite" aria-label="طباعة المذكرة">
      <div className="print-card">
        {!ready ? (
          <>
            <div className="print-spinner" aria-hidden="true" />
            <div className="print-title">جارٍ تجهيز المذكرة للطباعة…</div>
            <div className="print-bar"><span style={{ width: `${pct}%` }} /></div>
            <div className="print-pct">{pct}%</div>
          </>
        ) : (
          <>
            <div className="print-title">المذكرة جاهزة</div>
            <div className="print-hint">
              إذا لم تُفتح نافذة الطباعة تلقائياً، اضغط الزر التالي:
            </div>
            <button
              type="button"
              className="print-btn"
              onClick={() => { launchRef.current && launchRef.current(); }}
              autoFocus
            >
              🖨️ اطبع المذكرة
            </button>
            <button
              type="button"
              className="print-close"
              onClick={() => { onDone && onDone(); }}
            >
              إغلاق
            </button>
          </>
        )}
      </div>

      {/* iframe بأبعاد A4 حقيقية لكن خارج الشاشة — يهيّئ عارض PDF بشكل صحيح ويبقى غير مرئي */}
      <iframe
        ref={iframeRef}
        title="print-frame"
        aria-hidden="true"
        tabIndex={-1}
        style={{
          position: 'fixed',
          width: '210mm',
          height: '297mm',
          border: 0,
          left: '-10000px',
          top: 0,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
