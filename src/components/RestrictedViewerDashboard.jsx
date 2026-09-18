import { useEffect, useState } from 'react';
import { fetchViewerTree } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Topbar, Toast, useToast, matchQuery } from './ui.jsx';
import ProtectedViewer from './ProtectedViewer.jsx';

/**
 * لوحة "المشاهد المقيّد": تعرض فقط المواد/الصفوف المسموح بها (مفلترة من الخادم)،
 * وفتح أي مذكرة يشغّل العارض المحمي (صور + علامة مائية، بلا تحميل/طباعة).
 */
export default function RestrictedViewerDashboard() {
  const { user, logout } = useAuth();
  const { toast, show } = useToast();
  const [tree, setTree] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null); // {id, title}

  useEffect(() => {
    let alive = true;
    fetchViewerTree()
      .then((t) => { if (alive) setTree(t || []); })
      .catch((e) => show(e.message))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const hasContent = tree.some((s) => s.classes?.length);

  return (
    <div className="shell">
      <Topbar subtitle="عرض المذكرات" name={user.name} onLogout={logout} />

      <div className="memos-head">
        <input
          className="field"
          placeholder="بحث باسم المادة أو الصف…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="empty-note">جارٍ التحميل…</div>
      ) : !hasContent ? (
        <div className="empty-note">لا يوجد محتوى متاح لك بعد. تواصل مع إدارة المطبعة.</div>
      ) : (
        <div className="rv-content">
          {tree.map((stage) => (
            <div key={stage.stage} className="rv-stage">
              <h3 className="rv-stage-title">{stage.stage}</h3>
              {stage.classes.map((cls) => {
                const subjects = (cls.subjects || []).filter((sub) =>
                  matchQuery(q, [sub.name, cls.name, sub.document?.title]));
                if (!subjects.length) return null;
                return (
                  <div key={cls.id} className="rv-class">
                    <div className="rv-class-name">{cls.name}</div>
                    <div className="rv-subjects">
                      {subjects.map((sub) => (
                        <div key={sub.id} className="rv-subject">
                          <span className="rv-subject-name">{sub.name}</span>
                          {sub.document ? (
                            <button
                              className="btn sm"
                              onClick={() => setOpen({ id: sub.document.id, title: sub.document.title || sub.name })}
                            >
                              👁️ عرض
                            </button>
                          ) : (
                            <span className="rv-missing">لا توجد مذكرة</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {open && (
        <ProtectedViewer
          documentId={open.id}
          title={open.title}
          viewerName={user.name}
          viewerPhone={user.phone}
          onClose={() => setOpen(null)}
        />
      )}

      <Toast {...toast} />
    </div>
  );
}
