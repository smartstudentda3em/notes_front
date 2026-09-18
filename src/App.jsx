import { useAuth } from './context/AuthContext.jsx';
import Login from './components/Login.jsx';
import AdminDashboard from './components/AdminDashboard.jsx';
import TeacherDashboard from './components/TeacherDashboard.jsx';
import RestrictedViewerDashboard from './components/RestrictedViewerDashboard.jsx';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="center-screen muted">جارٍ التحميل...</div>;
  if (!user) return <Login />;

  // توجيه حسب الدور: المشاهد المقيّد → عارض محمي، المدرس → لوحته، والمطبعة/المساعد → لوحة المطبعة
  if (user.role === 'restricted_viewer') return <RestrictedViewerDashboard />;
  if (user.role === 'teacher') return <TeacherDashboard />;
  return <AdminDashboard />;
}
