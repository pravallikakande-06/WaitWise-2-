import { NavLink, Outlet, Link } from 'react-router-dom';
import { Activity, LogOut, Moon, Sun } from 'lucide-react';
import { useApp } from '../context/Providers.jsx';

export default function Shell({ links }) {
  const { user, logout, theme, toggleTheme } = useApp();
  return (
    <div className="shell">
      <header className="top">
        <Link to="/" className="brand"><Activity size={22} aria-hidden="true" /> WaitWise</Link>
        <div className="top-actions">
          <span className="muted hide-sm">{user.name} · {user.role}</span>
          <button className="icon-btn" onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button className="icon-btn" onClick={logout} aria-label="Log out"><LogOut size={18} /></button>
        </div>
      </header>
      <nav className="side" aria-label="Main">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}><Icon size={18} aria-hidden="true" /><span>{label}</span></NavLink>
        ))}
      </nav>
      <main className="main"><Outlet /></main>
    </div>
  );
}
