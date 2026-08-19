import { useRef, useState } from 'react';

/* شريط علوي موحّد */
export function Topbar({ subtitle, name, tabs = [], activeTab, onTab, onLogout, right }) {
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next = cur ? (cur === 'dark' ? 'light' : 'dark') : (prefersDark ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', next);
  }

  return (
    <header className="topbar">
      <div className="brand">
        <div className="logo">🖨️</div>
        <div className="t">
          <b>نظام المذكرات</b>
          <small>{subtitle} — {name}</small>
        </div>
      </div>

      {tabs.length > 0 && (
        <div className="tabs">
          {tabs.map((t) => (
            <button key={t.id} className={`tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => onTab(t.id)}>{t.label}</button>
          ))}
        </div>
      )}

      <div className="top-actions">
        {right}
        <button className="btn ghost sm icon" title="تبديل السمة" onClick={toggleTheme}>◐</button>
        <button className="btn ghost sm" onClick={onLogout}>خروج</button>
      </div>
    </header>
  );
}

/* Toast */
export function useToast() {
  const [state, setState] = useState({ msg: '', show: false });
  const timer = useRef();
  const show = (msg) => {
    setState({ msg, show: true });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState((s) => ({ ...s, show: false })), 2600);
  };
  return { toast: state, show };
}

export function Toast({ msg, show }) {
  return <div className={`toast ${show ? 'show' : ''}`} aria-live="polite">{msg}</div>;
}

/* بحث فوري: يطابق إذا كان الاستعلام فارغاً أو موجوداً في أحد الحقول */
export function matchQuery(q, fields) {
  const s = (q || '').trim().toLowerCase();
  if (!s) return true;
  return fields.some((f) => (f || '').toString().toLowerCase().includes(s));
}

/* حجم الملف بصيغة مقروءة */
export function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
