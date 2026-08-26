import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Layout({ children }) {
  const { user, signOut } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>Digital Library</strong>
          <span>Ruth Puaf</span>
        </div>

        <nav className="nav">
          <NavLink to="/books">Books</NavLink>
          <NavLink to="/students">Students</NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="who">
            <strong>{user.name}</strong>
            {user.email}
          </div>
          <button type="button" className="btn-secondary btn-sm" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
