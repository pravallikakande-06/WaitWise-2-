import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from '../services/api.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function Providers({ children }) {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('ww_user') || 'null'));
  const [theme, setTheme] = useState(() => localStorage.getItem('ww_theme') || 'light');
  const [toasts, setToasts] = useState([]);
  const [tick, setTick] = useState(0); // bumps whenever the server says queue data changed

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('ww_theme', theme); }, [theme]);

  const toast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  // Live updates: the server pushes 'queue:changed' and personal notifications over Socket.IO.
  useEffect(() => {
    if (!user) return undefined;
    const socket = io({ auth: { token: localStorage.getItem('ww_token') } });
    socket.on('queue:changed', () => setTick((t) => t + 1));
    socket.on('notification', (n) => toast(`${n.title}: ${n.message}`, 'info'));
    return () => socket.disconnect();
  }, [user?.id, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const authenticate = async (path, body) => {
    const d = await api(path, { method: 'POST', body });
    localStorage.setItem('ww_token', d.token);
    updateUser(d.user);
    return d.user;
  };
  const updateUser = (u) => { localStorage.setItem('ww_user', JSON.stringify(u)); setUser(u); };
  const logout = () => {
    api('/auth/logout', { method: 'POST' }).catch(() => {});
    localStorage.removeItem('ww_token'); localStorage.removeItem('ww_user'); setUser(null);
  };

  const value = {
    user, theme, toast, tick, logout, updateUser,
    toggleTheme: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')),
    login: (b) => authenticate('/auth/login', b),
    register: (b) => authenticate('/auth/register', b),
  };
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>)}
      </div>
    </Ctx.Provider>
  );
}
