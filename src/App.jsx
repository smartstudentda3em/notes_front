import { useAuth } from './context/AuthContext.jsx';
import Login from './components/Login.jsx';
import AdminDashboard from './components/AdminDashboard.jsx';
import TeacherDashboard from './components/TeacherDashboard.jsx';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="center-screen muted">جارٍ التحميل...</div>;
  if (!user) return <Login />;

  // المدرس له لوحته، ومدير المطبعة والمساعد يشتركان في لوحة المطبعة (بصلاحيات مختلفة)
  return user.role === 'teacher' ? <TeacherDashboard /> : <AdminDashboard />;
}
