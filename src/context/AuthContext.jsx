import { createContext, useContext, useEffect, useState } from 'react';
import { api, tokenStore } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // إعادة بناء الجلسة من التوكن المخزّن
  useEffect(() => {
    const token = tokenStore.get();
    if (!token) {
      setLoading(false);
      return;
    }
    api('/me')
      .then(setUser)
      .catch(() => {
        tokenStore.clear();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // إنهاء الجلسة إن أبلغ الـ API بانتهائها (401 مستمر)
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('memos:unauthorized', onUnauthorized);
    return () => window.removeEventListener('memos:unauthorized', onUnauthorized);
  }, []);

  // تجديد الرمز تلقائياً كل 20 دقيقة أثناء العمل (منع الخروج غير المقصود)
  useEffect(() => {
    if (!user) return;
    const id = setInterval(async () => {
      try {
        const data = await api('/refresh-token', { method: 'POST' });
        tokenStore.set(data.token);
        if (data.user) setUser(data.user);
      } catch (_) { /* تجاهل — المحاولة القادمة */ }
    }, 20 * 60 * 1000);
    return () => clearInterval(id);
  }, [user]);

  async function login(phone, password) {
    const data = await api('/login', { method: 'POST', body: { phone, password } });
    tokenStore.set(data.token);
    setUser(data.user);
    return data.user;
  }

  async function logout() {
    try {
      await api('/logout', { method: 'POST' });
    } catch (_) {
      /* تجاهل */
    }
    tokenStore.clear();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
