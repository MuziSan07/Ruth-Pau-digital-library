import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import BooksPage from './pages/BooksPage.jsx';
import StudentsPage from './pages/StudentsPage.jsx';

export default function App() {
  const { user, loading } = useAuth();

  // Firebase restores the previous session asynchronously. Rendering the login
  // screen during that window would flash it at an already-signed-in admin.
  if (loading) {
    return <div className="center-screen">Loading…</div>;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/books" element={<BooksPage />} />
        <Route path="/students" element={<StudentsPage />} />
        <Route path="*" element={<Navigate to="/books" replace />} />
      </Routes>
    </Layout>
  );
}
