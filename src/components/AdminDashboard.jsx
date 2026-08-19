import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import PrintViewer from './PrintViewer.jsx';
import BookletCard from './BookletCard.jsx';
import { Topbar, Toast, useToast, matchQuery } from './ui.jsx';

const ALL_STAGES = ['الابتدائي', 'المتوسط', 'الثانوي', 'الجامعة'];

export default function AdminDashboard() {
  const { user, setUser, logout } = useAuth();
  const isAdmin = user.role === 'admin_press';
  const canManage = isAdmin || user.scope === 'manage';
  const { toast, show } = useToast();

  const [tab, setTab] = useState('teachers');
  const [teachers, setTeachers] = useState([]);
  const [view, setView] = useState('list');
  const [current, setCurrent] = useState(null);
  const [tree, setTree] = useState([]);

  const [confirmReq, setConfirmReq] = useState(null); // نافذة تأكيد الحذف
  const [printJob, setPrintJob] = useState(null);      // {id, copies} تشغيل الطباعة

  async function loadTeachers() {
    try { setTeachers(await api('/admin/teachers')); } catch (e) { show(e.message); }
  }
  useEffect(() => { loadTeachers(); }, []);

  async function openTeacher(t) {
    try { const tr = await api(`/admin/teachers/${t.id}/tree`); setCurrent(t); setTree(tr); setView('detail'); }
    catch (e) { show(e.message); }
  }
  function back() { setView('list'); setCurrent(null); setTree([]); }

  useEffect(() => {
    const block = (e) => e.preventDefault();
    document.addEventListener('contextmenu', block);
    return () => document.removeEventListener('contextmenu', block);
  }, []);

  const askConfirm = (opts) => setConfirmReq(opts);            // {title, message, confirmLabel, onConfirm}
  const doPrint = (id, copies) => setPrintJob({ id, copies }); // طباعة مباشرة بعدد النسخ المُدخل في الكرت

  const tabs = [
    { id: 'teachers', label: 'المدرسون' },
    ...(isAdmin ? [{ id: 'assistants', label: 'المساعدون' }, { id: 'prints', label: 'النسخ المطبوعة' }] : []),
    { id: 'account', label: 'إعداداتي' },
  ];

  return (
    <div className="shell" onDragStart={(e) => e.preventDefault()}>
      <Topbar
        subtitle={isAdmin ? 'لوحة المطبعة' : (user.scope === 'manage' ? 'مساعد (إدارة)' : 'مساعد (طباعة)')}
        name={user.name} tabs={tabs} activeTab={tab} onTab={(t) => { setTab(t); if (t !== 'teachers') back(); }} onLogout={logout}
      />

      {tab === 'teachers' && (
        view === 'list'
          ? <TeachersListView teachers={teachers} canManage={canManage} onOpen={openTeacher} askConfirm={askConfirm} onChanged={(m) => { show(m); loadTeachers(); }} />
          : <TeacherDetail key={current.id} teacher={current} tree={tree} onBack={back} onPrint={doPrint} />
      )}
      {tab === 'assistants' && isAdmin && <AssistantsPanel notify={show} askConfirm={askConfirm} />}
      {tab === 'prints' && isAdmin && <PrintLogsPanel teachers={teachers} notify={show} />}
      {tab === 'account' && <AdminAccount user={user} onUpdated={setUser} notify={show} />}

      {/* تشغيل الطباعة الفعلي (عدد النسخ يأتي من الكرت مباشرة) */}
      {printJob && (
        <PrintViewer documentId={printJob.id} admin copies={printJob.copies}
          onDone={() => setPrintJob(null)} onError={(m) => { show(m); setPrintJob(null); }} />
      )}
      {/* نافذة تأكيد الحذف */}
      {confirmReq && (
        <ConfirmSheet {...confirmReq} onCancel={() => setConfirmReq(null)}
          onConfirm={() => { const fn = confirmReq.onConfirm; setConfirmReq(null); fn(); }} />
      )}

      <Toast {...toast} />
    </div>
  );
}

/* ================= نوافذ سفلية-وسطية ================= */
function ConfirmSheet({ title, message, confirmLabel = 'تأكيد الحذف', onConfirm, onCancel }) {
  return (
    <div className="sheet-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="sheet" role="alertdialog" aria-modal="true">
        <h4>{title}</h4>
        <p>{message}</p>
        <div className="sheet-actions">
          <button className="btn ghost" onClick={onCancel}>إلغاء</button>
          <button className="btn danger-solid" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* مدخل عدد النسخ + زر الطباعة داخل الكرت (لوحة المطبعة) */
function PressPrint({ docId, onPrint }) {
  const [copies, setCopies] = useState(1);
  return (
    <>
      <input className="field copies-input" type="number" min="1" max="10000" value={copies}
        title="عدد النسخ" onChange={(e) => setCopies(e.target.value)} />
      <button className="btn success sm" onClick={() => onPrint(docId, Math.max(1, Number(copies) || 1))}>🖨️ طباعة المذكرة</button>
    </>
  );
}

/* =====================================================================
 |  المدرسون: قائمة → تفاصيل
 ===================================================================== */
function TeachersListView({ teachers, canManage, onOpen, onChanged, askConfirm }) {
  const [q, setQ] = useState('');
  const list = teachers.filter((t) => matchQuery(q, [t.name, t.phone]));

  return (
    <>
      <div className="crumb"><span className="crumb-here">المدرسون</span></div>
      <div className="toolbar">
        <div className="between">
          <div className="search" style={{ flex: 1 }}>
            <span className="ico">🔎</span>
            <input className="field" placeholder="بحث باسم المدرس أو رقم الهاتف…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {canManage && <NewTeacher onChanged={onChanged} />}
        </div>
      </div>
      <div className="stack">
        {list.map((t) => <TeacherCard key={t.id} t={t} canManage={canManage} onOpen={onOpen} onChanged={onChanged} askConfirm={askConfirm} />)}
        {!list.length && <div className="empty-note">لا يوجد مدرسون ضمن نطاقك.</div>}
      </div>
    </>
  );
}

function NewTeacher({ onChanged }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [stages, setStages] = useState([]);
  function toggle(s) { setStages((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s])); }
  async function submit(e) {
    e.preventDefault();
    try {
      await api('/admin/teachers', { method: 'POST', body: { name, phone, password, stages } });
      setName(''); setPhone(''); setPassword(''); setStages([]); setOpen(false);
      onChanged('تم إنشاء حساب المدرس.');
    } catch (ex) { onChanged(ex.message); }
  }
  if (!open) return <button className="btn" onClick={() => setOpen(true)}>+ إضافة مدرس</button>;
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <form className="card stack modal" onSubmit={submit}>
        <div className="between"><h3>مدرس جديد</h3><button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>إغلاق</button></div>
        <input className="field" placeholder="الاسم" value={name} onChange={(e) => setName(e.target.value)} required />
        <input className="field" placeholder="رقم التليفون" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        <input className="field" placeholder="كلمة المرور المبدئية" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <div>
          <label>المراحل المتاحة له</label>
          <div className="filters">{ALL_STAGES.map((s) => <button type="button" key={s} className={`chip ${stages.includes(s) ? 'on' : ''}`} onClick={() => toggle(s)}>{s}</button>)}</div>
        </div>
        <button className="btn">إنشاء الحساب</button>
      </form>
    </div>
  );
}

function TeacherCard({ t, canManage, onOpen, onChanged, askConfirm }) {
  const [editStages, setEditStages] = useState(false);
  const [stages, setStages] = useState(t.stages || []);
  function toggle(s) { setStages((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s])); }
  const call = async (fn, ok) => { try { await fn(); onChanged(ok); } catch (e) { onChanged(e.message); } };

  return (
    <div className="teacher-item">
      <button className="hd hd-btn" onClick={() => onOpen(t)} title="عرض مذكرات المدرس">
        <span className="avatar">{(t.name || '؟').replace(/^أ\.\s*/, '').trim().charAt(0)}</span>
        <div style={{ minWidth: 0, textAlign: 'start' }}>
          <div className="nm">{t.name} {!t.is_active && <span className="mini-pill off">موقوف</span>}</div>
          <div className="ph">{t.phone}</div>
        </div>
        <span className="go">‹</span>
      </button>

      <div className="stage-chips" style={{ marginTop: 8 }}>
        {(t.stages || []).length ? (t.stages || []).map((s) => <span key={s} className="mini-pill">{s}</span>) : <span className="muted small">لا مراحل مسندة</span>}
      </div>

      {canManage && (editStages ? (
        <div style={{ marginTop: 8 }}>
          <div className="filters">{ALL_STAGES.map((s) => <button key={s} className={`chip ${stages.includes(s) ? 'on' : ''}`} onClick={() => toggle(s)}>{s}</button>)}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => call(() => api(`/admin/teachers/${t.id}`, { method: 'PUT', body: { stages } }), 'تم تحديث المراحل.').then(() => setEditStages(false))}>حفظ المراحل</button>
            <button className="btn ghost sm" onClick={() => { setStages(t.stages || []); setEditStages(false); }}>إلغاء</button>
          </div>
        </div>
      ) : (
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn soft sm" onClick={() => setEditStages(true)}>إسناد المراحل</button>
          <button className="btn ghost sm" onClick={() => { const name = prompt('الاسم:', t.name); if (name === null) return; const phone = prompt('رقم التليفون:', t.phone); if (phone === null) return; call(() => api(`/admin/teachers/${t.id}`, { method: 'PUT', body: { name, phone } }), 'تم تحديث البيانات.'); }}>تعديل</button>
          <button className="btn ghost sm" onClick={() => { const password = prompt(`كلمة مرور جديدة لـ ${t.name}:`); if (password) call(() => api(`/admin/teachers/${t.id}/password`, { method: 'PUT', body: { password } }), 'تمت إعادة التعيين.'); }}>كلمة المرور</button>
          <button className="btn ghost sm" onClick={() => call(() => api(`/admin/teachers/${t.id}/toggle`, { method: 'PATCH' }), t.is_active ? 'تم الإيقاف.' : 'تم التفعيل.')}>{t.is_active ? 'إيقاف' : 'تفعيل'}</button>
          <button className="btn danger sm" onClick={() => askConfirm({
            title: 'تأكيد حذف المدرس',
            message: <>هل أنت متأكد من حذف <b>{t.name}</b> نهائياً؟ سيُحذف حسابه وكل هيكله وملفاته ولا يمكن التراجع.</>,
            confirmLabel: 'حذف المدرس',
            onConfirm: () => call(() => api(`/admin/teachers/${t.id}`, { method: 'DELETE' }), 'تم حذف المدرس.'),
          })}>حذف</button>
        </div>
      ))}
    </div>
  );
}

/* =====================================================================
 |  تفاصيل المدرس — فلاتر متسلسلة + طباعة
 ===================================================================== */
function TeacherDetail({ teacher, tree, onBack, onPrint }) {
  const [stage, setStage] = useState('');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');

  const stages = tree.map((s) => s.stage);
  const classes = stage ? (tree.find((s) => s.stage === stage)?.classes || []) : [];
  const subjects = classId ? (classes.find((c) => c.id === Number(classId))?.subjects || []) : [];
  const shown = subjectId ? subjects.filter((s) => s.id === Number(subjectId)) : subjects;
  const totalUploaded = tree.flatMap((s) => s.classes).flatMap((c) => c.subjects).filter((x) => x.document).length;

  return (
    <>
      <div className="crumb">
        <button className="crumb-link" onClick={onBack}>المدرسون</button>
        <span className="crumb-sep">›</span>
        <span className="crumb-here">{teacher.name}</span>
        <button className="btn ghost sm" style={{ marginInlineStart: 'auto' }} onClick={onBack}>‹ رجوع</button>
      </div>

      <div className="card filters-card">
        <div className="filter-grid">
          <div>
            <label>المرحلة الدراسية</label>
            <select className="field" value={stage} onChange={(e) => { setStage(e.target.value); setClassId(''); setSubjectId(''); }}>
              <option value="">— اختر المرحلة —</option>
              {stages.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label>الصف الدراسي</label>
            <select className="field" value={classId} onChange={(e) => { setClassId(e.target.value); setSubjectId(''); }} disabled={!stage}>
              <option value="">{stage ? '— اختر الصف —' : 'اختر المرحلة أولاً'}</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label>المادة</label>
            <select className="field" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!classId}>
              <option value="">{classId ? 'كل المواد' : 'اختر الصف أولاً'}</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div className="muted small" style={{ marginTop: 4 }}>إجمالي الملفات الجاهزة للطباعة: {totalUploaded}</div>
      </div>

      {!stage ? <div className="empty-note">اختر المرحلة الدراسية للبدء.</div>
        : !classId ? <div className="empty-note">اختر الصف الدراسي لعرض مواده.</div>
        : !shown.length ? <div className="empty-note">لا توجد مواد في هذا الصف.</div>
        : (
          // نفس تصميم كروت المذكرات لدى المدرس (BookletCard) مع إجراءات المطبعة فقط
          <div className="class-panel">
            <div className="cp-head">
              <span className="cp-title"><span className="dot" />{classes.find((c) => c.id === Number(classId))?.name}</span>
              <span className="count-soft">{shown.filter((s) => s.document).length}/{shown.length} مرفوعة</span>
            </div>
            <div className="cp-body">
              {shown.map((sub) => (
                <BookletCard key={sub.id} sub={sub} role="press_manager" teacherName={teacher.name}
                  actions={sub.document ? <PressPrint docId={sub.document.id} onPrint={onPrint} /> : null} />
              ))}
            </div>
          </div>
        )}
    </>
  );
}

/* =====================================================================
 |  المساعدون (إدارة — مدير المطبعة فقط)
 ===================================================================== */
function AssistantsPanel({ notify, askConfirm }) {
  const [assistants, setAssistants] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [adding, setAdding] = useState(false);

  async function load() {
    try {
      const [a, t] = await Promise.all([api('/admin/assistants'), api('/admin/teachers')]);
      setAssistants(a); setTeachers(t);
    } catch (e) { notify(e.message); }
  }
  useEffect(() => { load(); }, []);

  const teacherName = (id) => teachers.find((t) => t.id === id)?.name || `#${id}`;

  return (
    <>
      <div className="crumb"><span className="crumb-here">المساعدون</span></div>
      <div className="toolbar"><div className="between"><span className="muted small">مساعدون بصلاحيات مرنة على الطباعة وإدارة المدرسين.</span>
        <button className="btn" onClick={() => setAdding(true)}>+ إضافة مساعد</button></div></div>

      {adding && <AssistantForm teachers={teachers} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); notify('تم إنشاء المساعد.'); }} />}

      <div className="stack">
        {assistants.map((a) => (
          <AssistantCard key={a.id} a={a} teachers={teachers} teacherName={teacherName} askConfirm={askConfirm} onChanged={(m) => { load(); notify(m); }} />
        ))}
        {!assistants.length && <div className="empty-note">لا يوجد مساعدون بعد.</div>}
      </div>
    </>
  );
}

function AssistantForm({ teachers, initial, onClose, onSaved }) {
  const editing = !!initial;
  const [name, setName] = useState(initial?.name || '');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [password, setPassword] = useState('');
  const [scope, setScope] = useState(initial?.scope || 'print');
  const [stages, setStages] = useState(initial?.stages || []);
  const [tIds, setTIds] = useState(initial?.allowed_teachers || []);
  function toggleStage(s) { setStages((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s])); }
  function toggleTeacher(id) { setTIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])); }

  async function submit(e) {
    e.preventDefault();
    const body = { name, phone, scope, stages, allowed_teachers: tIds };
    try {
      if (editing) await api(`/admin/assistants/${initial.id}`, { method: 'PUT', body });
      else await api('/admin/assistants', { method: 'POST', body: { ...body, password } });
      onSaved();
    } catch (ex) { alert(ex.message); }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="card stack modal" onSubmit={submit}>
        <div className="between"><h3>{editing ? 'تعديل صلاحيات المساعد' : 'مساعد جديد'}</h3><button type="button" className="btn ghost sm" onClick={onClose}>إغلاق</button></div>
        <input className="field" placeholder="الاسم" value={name} onChange={(e) => setName(e.target.value)} required />
        <input className="field" placeholder="رقم التليفون" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        {!editing && <input className="field" placeholder="كلمة المرور المبدئية" value={password} onChange={(e) => setPassword(e.target.value)} required />}

        <div>
          <label>نطاق العمل</label>
          <div className="filters">
            <button type="button" className={`chip ${scope === 'print' ? 'on' : ''}`} onClick={() => setScope('print')}>طباعة فقط</button>
            <button type="button" className={`chip ${scope === 'manage' ? 'on' : ''}`} onClick={() => setScope('manage')}>إضافة/تعديل + طباعة</button>
          </div>
        </div>

        <div>
          <label>المراحل المسموح بها (فارغ = كل المراحل)</label>
          <div className="filters">{ALL_STAGES.map((s) => <button type="button" key={s} className={`chip ${stages.includes(s) ? 'on' : ''}`} onClick={() => toggleStage(s)}>{s}</button>)}</div>
        </div>

        <div>
          <label>مدرسون محددون (فارغ = كل المدرسين)</label>
          <div className="filters">
            {teachers.map((t) => <button type="button" key={t.id} className={`chip ${tIds.includes(t.id) ? 'on' : ''}`} onClick={() => toggleTeacher(t.id)}>{t.name}</button>)}
          </div>
        </div>

        <button className="btn">{editing ? 'حفظ الصلاحيات' : 'إنشاء المساعد'}</button>
      </form>
    </div>
  );
}

function AssistantCard({ a, teachers, teacherName, onChanged, askConfirm }) {
  const [editing, setEditing] = useState(false);
  const call = async (fn, ok) => { try { await fn(); onChanged(ok); } catch (e) { onChanged(e.message); } };

  return (
    <div className="teacher-item">
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div className="hd">
          <span className="avatar">🧑‍💼</span>
          <div style={{ minWidth: 0 }}>
            <div className="nm">{a.name} {!a.is_active && <span className="mini-pill off">موقوف</span>}</div>
            <div className="ph">{a.phone}</div>
          </div>
        </div>
        <span className={`status ${a.scope === 'manage' ? 'ok' : 'missing'}`}>{a.scope === 'manage' ? 'إضافة/تعديل + طباعة' : 'طباعة فقط'}</span>
      </div>

      <div className="small" style={{ marginTop: 10 }}>
        <div><span className="muted">المراحل: </span>{(a.stages || []).length ? a.stages.join('، ') : 'كل المراحل'}</div>
        <div style={{ marginTop: 4 }}><span className="muted">المدرسون: </span>{(a.allowed_teachers || []).length ? a.allowed_teachers.map(teacherName).join('، ') : 'كل المدرسين'}</div>
      </div>

      {editing && <AssistantForm teachers={teachers} initial={a} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged('تم تحديث الصلاحيات.'); }} />}

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn soft sm" onClick={() => setEditing(true)}>تخصيص الصلاحيات</button>
        <button className="btn ghost sm" onClick={() => { const password = prompt(`كلمة مرور جديدة لـ ${a.name}:`); if (password) call(() => api(`/admin/assistants/${a.id}/password`, { method: 'PUT', body: { password } }), 'تمت إعادة التعيين.'); }}>كلمة المرور</button>
        <button className="btn ghost sm" onClick={() => call(() => api(`/admin/assistants/${a.id}/toggle`, { method: 'PATCH' }), a.is_active ? 'تم الإيقاف.' : 'تم التفعيل.')}>{a.is_active ? 'إيقاف' : 'تفعيل'}</button>
        <button className="btn danger sm" onClick={() => askConfirm({
          title: 'تأكيد حذف المساعد',
          message: <>هل أنت متأكد من حذف المساعد <b>{a.name}</b> نهائياً؟</>,
          confirmLabel: 'حذف المساعد',
          onConfirm: () => call(() => api(`/admin/assistants/${a.id}`, { method: 'DELETE' }), 'تم حذف المساعد.'),
        })}>حذف</button>
      </div>
    </div>
  );
}

/* =====================================================================
 |  النسخ المطبوعة — عدّاد + سجلّ + فلترة
 ===================================================================== */
function PrintLogsPanel({ teachers, notify }) {
  const [data, setData] = useState({ grand_total_copies: 0, grand_total_operations: 0, summary: { operations: 0, copies: 0 }, logs: [] });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [subject, setSubject] = useState('');

  async function load() {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (teacherId) qs.set('teacher_id', teacherId);
    if (subject) qs.set('subject', subject);
    try { setData(await api(`/admin/print-logs?${qs.toString()}`)); } catch (e) { notify(e.message); }
  }
  useEffect(() => { load(); }, [from, to, teacherId, subject]); // تحميل أولي + عند تغيّر الفلترة

  const fmt = (dt) => {
    const d = new Date(dt);
    return d.toLocaleString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };
  const reset = () => { setFrom(''); setTo(''); setTeacherId(''); setSubject(''); };

  return (
    <>
      <div className="crumb"><span className="crumb-here">النسخ المطبوعة</span></div>

      <div className="counter-row">
        <div className="counter-card accent">
          <div className="k">إجمالي النسخ المطبوعة</div>
          <div className="v">{data.grand_total_copies.toLocaleString('ar-EG')}</div>
        </div>
        <div className="counter-card">
          <div className="k">إجمالي عمليات الطباعة</div>
          <div className="v">{data.grand_total_operations.toLocaleString('ar-EG')}</div>
        </div>
        <div className="counter-card">
          <div className="k">النتائج المطابقة للفلتر (نسخ)</div>
          <div className="v">{data.summary.copies.toLocaleString('ar-EG')}</div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="fb"><label>من تاريخ</label><input className="field" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="fb"><label>إلى تاريخ</label><input className="field" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="fb"><label>المدرس</label>
          <select className="field" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            <option value="">كل المدرسين</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="fb"><label>المادة</label><input className="field" placeholder="بحث بالمادة…" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
        <button className="btn ghost" onClick={reset}>مسح الفلاتر</button>
      </div>

      <div className="table-wrap">
        <table className="logs">
          <thead>
            <tr>
              <th>المدرس</th><th>المادة</th><th>الصف / المرحلة</th><th>المذكرة</th>
              <th>عدد النسخ</th><th>التاريخ والوقت</th><th>بواسطة</th>
            </tr>
          </thead>
          <tbody>
            {data.logs.map((l) => (
              <tr key={l.id}>
                <td>{l.teacher_name || '—'}</td>
                <td>{l.subject_name || '—'}</td>
                <td>{[l.class_name, l.stage].filter(Boolean).join(' / ') || '—'}</td>
                <td>{l.memo_title || '—'}</td>
                <td><span className="copies">{Number(l.copies).toLocaleString('ar-EG')}</span></td>
                <td>{fmt(l.printed_at)}</td>
                <td>{l.actor_name}{l.actor_role === 'assistant' ? ' (مساعد)' : ''}</td>
              </tr>
            ))}
            {!data.logs.length && (
              <tr><td colSpan="7" style={{ textAlign: 'center', color: 'var(--muted)', padding: '26px' }}>لا توجد عمليات طباعة مطابقة.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* =====================================================================
 |  إعداداتي (بيانات مدير المطبعة / المساعد)
 ===================================================================== */
function AdminAccount({ user, onUpdated, notify }) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [cur, setCur] = useState('');
  const [np, setNp] = useState('');
  const [npc, setNpc] = useState('');

  async function saveProfile(e) {
    e.preventDefault();
    try { const r = await api('/account/profile', { method: 'PUT', body: { name, phone } }); onUpdated({ ...user, ...r.user }); notify('تم تحديث البيانات.'); }
    catch (ex) { notify(ex.message); }
  }
  async function savePassword(e) {
    e.preventDefault();
    try { await api('/account/password', { method: 'PUT', body: { current_password: cur, new_password: np, new_password_confirmation: npc } }); setCur(''); setNp(''); setNpc(''); notify('تم تغيير كلمة المرور.'); }
    catch (ex) { notify(ex.message); }
  }

  return (
    <>
      <div className="crumb"><span className="crumb-here">إعداداتي</span></div>
      <div className="grid-2">
        <form className="card stack" onSubmit={saveProfile}>
          <h3>البيانات الشخصية</h3>
          <div><label>الاسم</label><input className="field" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label>رقم الهاتف</label><input className="field" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <button className="btn">حفظ البيانات</button>
        </form>
        <form className="card stack" onSubmit={savePassword}>
          <h3>تغيير كلمة المرور</h3>
          <div><label>كلمة المرور الحالية</label><input className="field" type="password" value={cur} onChange={(e) => setCur(e.target.value)} required /></div>
          <div><label>كلمة المرور الجديدة</label><input className="field" type="password" value={np} onChange={(e) => setNp(e.target.value)} required /></div>
          <div><label>تأكيد كلمة المرور الجديدة</label><input className="field" type="password" value={npc} onChange={(e) => setNpc(e.target.value)} required /></div>
          <button className="btn">تغيير كلمة المرور</button>
        </form>
      </div>
    </>
  );
}
