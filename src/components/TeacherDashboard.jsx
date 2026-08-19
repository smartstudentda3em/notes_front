import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import PrintViewer from './PrintViewer.jsx';
import BookletCard from './BookletCard.jsx';
import { Topbar, Toast, useToast, matchQuery } from './ui.jsx';

export default function TeacherDashboard() {
  const { user, setUser, logout } = useAuth();
  const [tab, setTab] = useState('memos');
  const [tree, setTree] = useState([]);
  const { toast, show } = useToast();

  async function loadTree() {
    try { setTree(await api('/tree')); } catch (e) { show(e.message); }
  }
  useEffect(() => { loadTree(); }, []);

  return (
    <div className="shell">
      <Topbar
        subtitle="لوحة المدرس" name={user.name}
        tabs={[{ id: 'memos', label: 'المذكرات' }, { id: 'account', label: 'إعدادات الحساب' }]}
        activeTab={tab} onTab={setTab} onLogout={logout}
      />

      {tab === 'memos'
        ? <MemosView tree={tree} stages={user.stages || []} reload={loadTree} notify={show} />
        : <AccountSettings user={user} stages={user.stages || []} onUpdated={setUser} notify={show} />}

      <Toast {...toast} />
    </div>
  );
}

/* ================= بحث علوي + Sidebar فلترة + منطقة رئيسية ================= */
function MemosView({ tree, stages, reload, notify }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');       // all | ok | missing
  const [stageSel, setStageSel] = useState('all');   // 'all' أو اسم مرحلة
  const [classSel, setClassSel] = useState('all');   // 'all' أو معرّف صف
  const [printId, setPrintId] = useState(null);

  // إعادة ضبط الصف عند تغيير المرحلة
  function pickStage(v) { setStageSel(v); setClassSel('all'); }

  const stageObj = stageSel === 'all' ? null : tree.find((s) => s.stage === stageSel);
  const sideClasses = stageObj?.classes || [];

  const searchActive = !!(q.trim() || status !== 'all');

  const subjectMatches = (sub, cls, stage) => {
    if (status === 'ok' && !sub.document) return false;
    if (status === 'missing' && sub.document) return false;
    return matchQuery(q, [sub.name, cls.name, stage, sub.document?.title]);
  };

  // wrappers للأوامر
  const wrap = (fn) => async (...a) => { try { await fn(...a); reload(); } catch (e) { notify(e.message); } };
  const H = {
    addClass: wrap(async (stage, name) => { await api('/classes', { method: 'POST', body: { stage, name } }); notify('تم إنشاء الصف.'); }),
    delClass: wrap(async (id) => { await api(`/classes/${id}`, { method: 'DELETE' }); notify('تم حذف الصف.'); }),
    reorderClasses: wrap(async (ids) => { await api('/classes/reorder', { method: 'POST', body: { ids } }); }),
    addSubject: wrap(async (classId, name) => { await api('/subjects', { method: 'POST', body: { class_id: classId, name } }); notify('تمت إضافة المادة.'); }),
    delSubject: wrap(async (id) => { await api(`/subjects/${id}`, { method: 'DELETE' }); notify('تم حذف المادة.'); }),
    reorderSubjects: wrap(async (classId, ids) => { await api('/subjects/reorder', { method: 'POST', body: { class_id: classId, ids } }); }),
    upload: wrap(async (subjectId, file) => {
      if (file.type !== 'application/pdf') throw new Error('يُقبل ملف PDF فقط.');
      const form = new FormData(); form.append('file', file);
      await api(`/subjects/${subjectId}/document`, { method: 'POST', body: form, isForm: true }); notify('تم حفظ المذكرة.');
    }),
    delDoc: wrap(async (id) => { await api(`/documents/${id}`, { method: 'DELETE' }); notify('تم حذف الملف.'); }),
    print: (id) => setPrintId(id),
  };
  const confirmDel = (msg, fn) => { if (confirm(msg)) fn(); };

  if (!stages.length) {
    return <div className="empty-note">لم تُسنَد إليك أي مراحل دراسية بعد. تواصل مع مدير المطبعة لإسنادها.</div>;
  }

  // المراحل المعروضة في المنطقة الرئيسية
  const shownStages = stageSel === 'all' ? tree : tree.filter((s) => s.stage === stageSel);

  return (
    <>
      {/* هيدر البحث */}
      <div className="memos-head">
        <div className="search">
          <span className="ico">🔎</span>
          <input className="field" placeholder="بحث فوري باسم المادة أو المذكرة…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="filters">
          <span className="chip-label">الحالة:</span>
          <button className={`chip ${status === 'all' ? 'on' : ''}`} onClick={() => setStatus('all')}>الكل</button>
          <button className={`chip ${status === 'ok' ? 'on' : ''}`} onClick={() => setStatus('ok')}>مرفوعة</button>
          <button className={`chip ${status === 'missing' ? 'on' : ''}`} onClick={() => setStatus('missing')}>ناقصة</button>
        </div>
      </div>

      <div className="memo-layout">
        {/* الشريط الجانبي */}
        <aside className="sidebar">
          <div className="side-group">
            <div className="side-title">المرحلة الدراسية</div>
            <div className="side-list">
              <button className={`side-btn ${stageSel === 'all' ? 'on' : ''}`} onClick={() => pickStage('all')}>عرض الكل</button>
              {tree.map((s) => (
                <button key={s.stage} className={`side-btn ${stageSel === s.stage ? 'on' : ''}`} onClick={() => pickStage(s.stage)}>
                  <span>{s.stage}</span><span className="side-count">{s.classes.length}</span>
                </button>
              ))}
            </div>
          </div>

          {/* قائمة الصفوف الديناميكية */}
          {stageObj && (
            <div className="side-group">
              <div className="side-title">الصفوف — {stageObj.stage}</div>
              <div className="side-list">
                <button className={`side-btn ${classSel === 'all' ? 'on' : ''}`} onClick={() => setClassSel('all')}>عرض الكل</button>
                {sideClasses.map((c, idx) => (
                  <div className="side-item" key={c.id}>
                    <button className={`side-btn ${classSel === c.id ? 'on' : ''}`} onClick={() => setClassSel(c.id)}>
                      <span>{c.name}</span>
                      <span className="side-count">{c.subjects.filter((s) => s.document).length}/{c.subjects.length}</span>
                    </button>
                    <span className="side-reorder">
                      <button className="iconbtn" title="أعلى" disabled={idx === 0} onClick={() => { const ids = sideClasses.map((x) => x.id); [ids[idx], ids[idx - 1]] = [ids[idx - 1], ids[idx]]; H.reorderClasses(ids); }}>▲</button>
                      <button className="iconbtn" title="أسفل" disabled={idx === sideClasses.length - 1} onClick={() => { const ids = sideClasses.map((x) => x.id); [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]]; H.reorderClasses(ids); }}>▼</button>
                    </span>
                  </div>
                ))}
              </div>
              <AddClass stage={stageObj.stage} onAdd={H.addClass} />
            </div>
          )}
        </aside>

        {/* المنطقة الرئيسية */}
        <main className="main-area">
          {shownStages.map((s) => {
            const classes = s.classes.filter((c) => classSel === 'all' || c.id === classSel);
            return (
              <div key={s.stage} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {stageSel === 'all' && (
                  <div className="stage-heading"><span className="stage-pill">{s.stage}</span><span className="count-soft">{s.classes.length} صف</span></div>
                )}
                {classes.length ? classes.map((c) => (
                  <ClassPanel key={c.id} stage={s.stage} cls={c} allClasses={s.classes}
                    subjectMatches={subjectMatches} searchActive={searchActive} H={H} confirmDel={confirmDel} />
                )) : (
                  <div className="empty-note">لا توجد صفوف في {s.stage} — أضِف صفاً من الشريط الجانبي.</div>
                )}
              </div>
            );
          })}

          {shownStages.every((s) => !s.classes.filter((c) => classSel === 'all' || c.id === classSel).length) && stageSel !== 'all' && null}
        </main>
      </div>

      {printId && <PrintViewer documentId={printId} admin={false} onDone={() => setPrintId(null)} onError={(m) => { notify(m); setPrintId(null); }} />}
    </>
  );
}

function AddClass({ stage, onAdd }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  if (!open) return <button className="btn soft sm block" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>+ صف جديد</button>;
  return (
    <div className="inline-add" style={{ marginTop: 8, flexWrap: 'wrap' }}>
      <input className="field" placeholder="اسم الصف" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <div className="row" style={{ gap: 6 }}>
        <button className="btn sm" onClick={() => { if (name.trim()) { onAdd(stage, name.trim()); setName(''); setOpen(false); } }}>حفظ</button>
        <button className="btn ghost sm" onClick={() => { setOpen(false); setName(''); }}>إلغاء</button>
      </div>
    </div>
  );
}

function ClassPanel({ stage, cls, allClasses, subjectMatches, searchActive, H, confirmDel }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const subjects = cls.subjects.filter((sub) => subjectMatches(sub, cls, stage));

  // إخفاء اللوحة إن كان البحث فعّالاً ولا نتائج
  if (searchActive && !subjects.length) return null;

  const subjectIds = cls.subjects.map((s) => s.id);
  function moveSubject(sub, dir) {
    const i = subjectIds.indexOf(sub.id);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= subjectIds.length) return;
    const ids = [...subjectIds]; [ids[i], ids[j]] = [ids[j], ids[i]];
    H.reorderSubjects(cls.id, ids);
  }

  return (
    <div className="class-panel">
      <div className="cp-head">
        <span className="cp-title"><span className="dot" />{cls.name}</span>
        <span className="count-soft">{cls.subjects.filter((s) => s.document).length}/{cls.subjects.length} مرفوعة</span>
        <span className="cp-actions">
          <button className="btn soft sm" onClick={() => setAdding((v) => !v)}>+ مادة</button>
          <button className="btn danger sm" onClick={() => confirmDel('حذف الصف وكل مواده وملفاته؟', () => H.delClass(cls.id))}>حذف الصف</button>
        </span>
      </div>

      <div className="cp-body">
        {adding && (
          <div className="inline-add" style={{ marginBottom: 8 }}>
            <input className="field" placeholder="اسم المادة (مثال: رياضيات)" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <button className="btn sm" onClick={() => { if (name.trim()) { H.addSubject(cls.id, name.trim()); setName(''); setAdding(false); } }}>حفظ</button>
            <button className="btn ghost sm" onClick={() => { setAdding(false); setName(''); }}>إلغاء</button>
          </div>
        )}

        {subjects.length ? subjects.map((sub) => (
          <SubjectRow key={sub.id} sub={sub} idx={subjectIds.indexOf(sub.id)} total={subjectIds.length}
            onMove={(d) => moveSubject(sub, d)} searchActive={searchActive} H={H} confirmDel={confirmDel} />
        )) : (!adding && <div className="muted small" style={{ padding: '8px 10px' }}>لا مواد بعد — أضِف مادة.</div>)}
      </div>
    </div>
  );
}

function SubjectRow({ sub, idx, total, onMove, searchActive, H, confirmDel }) {
  const fileRef = useRef(null);
  const hasDoc = !!sub.document;

  const reorder = !searchActive ? (
    <span className="reorder">
      <button className="iconbtn" title="أعلى" disabled={idx === 0} onClick={() => onMove('up')}>▲</button>
      <button className="iconbtn" title="أسفل" disabled={idx === total - 1} onClick={() => onMove('down')}>▼</button>
    </span>
  ) : null;

  const actions = (
    <>
      <input type="file" accept="application/pdf" ref={fileRef} style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files[0]; if (f) H.upload(sub.id, f); e.target.value = ''; }} />
      {hasDoc ? (
        <>
          <button className="btn success sm" onClick={() => H.print(sub.document.id)}>🖨️ طباعة</button>
          <button className="btn danger sm" onClick={() => confirmDel('حذف الملف فقط؟ (المادة تبقى)', () => H.delDoc(sub.document.id))}>حذف الملف</button>
        </>
      ) : (
        <button className="btn sm" onClick={() => fileRef.current.click()}>⬆️ رفع مذكرة</button>
      )}
      <button className="btn danger sm" title="حذف المادة" onClick={() => confirmDel('حذف المادة نهائياً؟', () => H.delSubject(sub.id))}>✕</button>
    </>
  );

  return <BookletCard sub={sub} role="teacher" reorder={reorder} actions={actions} />;
}

/* ================= إعدادات الحساب ================= */
function AccountSettings({ user, stages, onUpdated, notify }) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [cur, setCur] = useState('');
  const [np, setNp] = useState('');
  const [npc, setNpc] = useState('');

  async function saveProfile(e) {
    e.preventDefault();
    try { const r = await api('/account/profile', { method: 'PUT', body: { name, phone } }); onUpdated(r.user); notify('تم تحديث البيانات.'); }
    catch (ex) { notify(ex.message); }
  }
  async function savePassword(e) {
    e.preventDefault();
    try {
      await api('/account/password', { method: 'PUT', body: { current_password: cur, new_password: np, new_password_confirmation: npc } });
      setCur(''); setNp(''); setNpc(''); notify('تم تغيير كلمة المرور.');
    } catch (ex) { notify(ex.message); }
  }

  return (
    <div className="grid-2">
      <div className="stack">
        <form className="card stack" onSubmit={saveProfile}>
          <h3>البيانات الشخصية</h3>
          <div><label>الاسم</label><input className="field" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label>رقم التليفون</label><input className="field" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <button className="btn">حفظ البيانات</button>
        </form>
        <div className="card">
          <h3>المراحل الدراسية المخصّصة لك</h3>
          <p className="muted small" style={{ margin: '6px 0 10px' }}>يحددها مدير المطبعة.</p>
          <div className="stage-chips">
            {stages.length ? stages.map((s) => <span key={s} className="stage-pill">{s}</span>) : <span className="muted small">لا توجد مراحل مسندة.</span>}
          </div>
        </div>
      </div>

      <form className="card stack" onSubmit={savePassword}>
        <h3>تغيير كلمة المرور</h3>
        <div><label>كلمة المرور الحالية</label><input className="field" type="password" value={cur} onChange={(e) => setCur(e.target.value)} required /></div>
        <div><label>كلمة المرور الجديدة</label><input className="field" type="password" value={np} onChange={(e) => setNp(e.target.value)} required /></div>
        <div><label>تأكيد كلمة المرور الجديدة</label><input className="field" type="password" value={npc} onChange={(e) => setNpc(e.target.value)} required /></div>
        <button className="btn">تغيير كلمة المرور</button>
      </form>
    </div>
  );
}
