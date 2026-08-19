import { useEffect, useRef, useState } from 'react';
import { fetchDocumentBlob } from '../api/client.js';

/**
 * PrintViewer — مكوّن طباعة مخفي.
 * يجلب الـ PDF كـ Blob Stream (بجودة الـ Vector الأصلية 300+ DPI)،
 * يمرّره إلى Hidden Iframe، ثم يشغّل window.print() الأصلي للمتصفح مباشرة
 * على الملف الأصلي — دون تحويله إلى صورة (Canvas/JPEG) ودون أي زر تحميل.
 *
 * onDone(): يُستدعى بعد إطلاق أمر الطباعة (لإخفاء اللودر).
 */
export default function PrintViewer({ documentId, admin = false, copies = 1, onDone, onError }) {
  const iframeRef = useRef(null);
  const [status, setStatus] = useState('جارٍ تجهيز الطباعة...');

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;

    (async () => {
      try {
        const blob = await fetchDocumentBlob(documentId, { admin, copies });
        if (cancelled) return;

        // Blob URL محلي (blob:) — لا يمثّل رابطاً للسيرفر يمكن مشاركته/تنزيله
        objectUrl = URL.createObjectURL(blob);
        const iframe = iframeRef.current;
        iframe.src = objectUrl;

        iframe.onload = () => {
          try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print(); // الطباعة المباشرة على الـ PDF الأصلي
            setStatus('تم فتح نافذة الطباعة.');
            onDone && onDone();
          } catch (e) {
            onError && onError('تعذّر تشغيل الطباعة تلقائياً.');
          }
        };
      } catch (e) {
        onError && onError(e.message);
      }
    })();

    return () => {
      cancelled = true;
      // تحرير الذاكرة بعد الطباعة
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    };
  }, [documentId]);

  return (
    <div aria-hidden="true">
      <span className="sr-only">{status}</span>
      {/* iframe مخفي بالكامل عن العرض لكنه فعّال للطباعة */}
      <iframe
        ref={iframeRef}
        title="print-frame"
        style={{
          position: 'fixed',
          width: 0,
          height: 0,
          border: 0,
          left: '-9999px',
          top: '-9999px',
        }}
      />
    </div>
  );
}
