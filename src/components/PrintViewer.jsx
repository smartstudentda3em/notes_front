import { useEffect, useRef, useState } from 'react';
import { fetchDocumentBlob } from '../api/client.js';

/**
 * PrintViewer — مكوّن طباعة مخفي.
 * يجلب الـ PDF كـ Blob (بجودة الـ Vector الأصلية) على أجزاء عبر HTTP Range،
 * يمرّره إلى Hidden Iframe، ثم يشغّل window.print() الأصلي للمتصفح مباشرة
 * على الملف الأصلي — دون تحويله إلى صورة ودون أي زر تحميل.
 *
 * ملاحظات متانة الطباعة:
 * - التحميل على أجزاء يعالج فشل تحميل الملفات الكبيرة على الشبكات الضعيفة.
 * - الـ iframe يأخذ أبعاداً حقيقية (A4) خارج الشاشة؛ فإطار بمقاس 0×0 يمنع
 *   عارض PDF المضمّن من التهيئة ويجعل print() يفشل.
 * - نمنح العارض مهلة بعد التحميل قبل الطباعة، مع إعادة محاولة وشبكة أمان زمنية.
 * - نعرض مؤشّر تقدّم مرئياً لأن التحميل قد يستغرق عدة ثوانٍ للملفات الكبيرة.
 *
 * onDone(): يُستدعى بعد إطلاق أمر الطباعة (لإخفاء اللودر).
 */
export default function PrintViewer({ documentId, admin = false, copies = 1, onDone, onError }) {
  const iframeRef = useRef(null);
  const [pct, setPct] = useState(0);       // نسبة التحميل (0-100)
  const [phase, setPhase] = useState('downloading'); // downloading | printing

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    let printed = false;
    const timers = [];

    // محاولة تشغيل الطباعة مع إعادة المحاولة إن لم يكن العارض جاهزاً بعد
    const launchPrint = (attempt = 0) => {
      if (cancelled || printed) return;
      const win = iframeRef.current && iframeRef.current.contentWindow;
      try {
        if (!win) throw new Error('frame-not-ready');
        win.focus();
        win.print(); // الطباعة المباشرة على الـ PDF الأصلي
        printed = true;
        onDone && onDone();
      } catch (e) {
        if (attempt < 4) {
          timers.push(setTimeout(() => launchPrint(attempt + 1), 600));
        } else {
          onError && onError('تعذّر تشغيل الطباعة تلقائياً. أعد المحاولة من فضلك.');
        }
      }
    };

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
        setPhase('printing');

        // Blob URL محلي (blob:) — لا يمثّل رابطاً للسيرفر يمكن مشاركته/تنزيله
        objectUrl = URL.createObjectURL(blob);
        const iframe = iframeRef.current;

        // امنح عارض PDF مهلة للتهيئة قبل استدعاء الطباعة (يهم الملفات الكبيرة)
        iframe.onload = () => timers.push(setTimeout(() => launchPrint(0), 400));
        iframe.src = objectUrl;

        // شبكة أمان: بعض المتصفحات لا تُطلق onload لعارض PDF المضمّن
        timers.push(setTimeout(() => launchPrint(0), 2500));
      } catch (e) {
        if (!cancelled) onError && onError(e.message);
      }
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      // تحرير الذاكرة بعد الطباعة
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    };
  }, [documentId]);

  return (
    <div className="print-overlay" role="status" aria-live="polite">
      <div className="print-card">
        <div className="print-spinner" aria-hidden="true" />
        <div className="print-title">
          {phase === 'downloading' ? 'جارٍ تجهيز المذكرة للطباعة…' : 'جارٍ فتح نافذة الطباعة…'}
        </div>
        {phase === 'downloading' && (
          <>
            <div className="print-bar"><span style={{ width: `${pct}%` }} /></div>
            <div className="print-pct">{pct}%</div>
          </>
        )}
      </div>

      {/* iframe بأبعاد حقيقية (A4) لكن خارج الشاشة وشفّاف — يهيّئ عارض PDF بشكل صحيح */}
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
          opacity: 0,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
