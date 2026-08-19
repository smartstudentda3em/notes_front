import { formatSize } from './ui.jsx';

/**
 * كرت المذكرة الموحّد بين لوحة المدرس ولوحة مدير المطبعة.
 * الشكل الظاهري واحد؛ تتغيّر الإجراءات فقط حسب role:
 *  - role="teacher": أزرار الرفع/الطباعة/الحذف (تُمرَّر عبر actions) + إعادة الترتيب.
 *  - role="press_manager": تفاصيل المذكرة + إجراء الطباعة فقط (تُمرَّر عبر actions).
 */
export default function BookletCard({ sub, role = 'teacher', teacherName, reorder = null, actions = null }) {
  const hasDoc = !!sub.document;

  return (
    <div className="srow">
      {reorder}
      <span className="s-ico">{hasDoc ? '📄' : '📁'}</span>

      <span className="s-info">
        <span className="s-name">{sub.name}</span>

        {/* تفاصيل خاصة بلوحة المطبعة */}
        {role === 'press_manager' && (
          hasDoc ? (
            <span className="s-sub">
              {sub.document.original_name || 'ملف PDF'} · {formatSize(sub.document.size)}
              {teacherName ? ` · ${teacherName}` : ''}
            </span>
          ) : (
            <span className="s-sub">لا يوجد ملف مرفوع لهذه المادة.</span>
          )
        )}
      </span>

      <span className={`status ${hasDoc ? 'ok' : 'missing'}`}>{hasDoc ? 'مرفوعة' : 'ناقصة'}</span>

      {actions && <span className="s-actions">{actions}</span>}
    </div>
  );
}
