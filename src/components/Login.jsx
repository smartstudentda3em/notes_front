import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(phone.trim(), password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <form className="card auth-card stack" onSubmit={submit}>
        <div className="brand" style={{ marginBottom: 4 }}>
          <div className="logo">🖨️</div>
          <div className="t">
            <b style={{ fontSize: 17 }}>نظام المذكرات</b>
            <small>إدارة وطباعة مذكرات المطبعة والمدرسين</small>
          </div>
        </div>

        <div>
          <label>رقم التليفون</label>
          <input className="field" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01xxxxxxxxx" required />
        </div>

        <div>
          <label>كلمة المرور</label>
          <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
        </div>

        {error && <div className="alert error" style={{ margin: 0 }}>{error}</div>}

        <button className="btn block" type="submit" disabled={busy}>
          {busy ? 'جارٍ الدخول…' : 'دخول'}
        </button>
      </form>
    </div>
  );
}
