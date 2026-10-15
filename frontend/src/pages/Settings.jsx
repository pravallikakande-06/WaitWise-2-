import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { api } from '../services/api.js';
import { useApp } from '../context/Providers.jsx';

const PREFS = [
  ['approaching', 'Turn approaching', 'Alert me when only 5 patients are ahead.'],
  ['update', 'Queue and appointment updates', 'Token issued, appointments booked, wait changes.'],
  ['delay', 'Doctor delays', 'Tell me when my doctor is running late.'],
  ['return', 'Return reminders', 'Remind me to come back to the waiting area.'],
];

export default function SettingsPage() {
  const { user, updateUser, theme, toggleTheme, toast } = useApp();
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const prefs = user.notificationPrefs || {};

  const setPref = async (key, value) => {
    try { updateUser(await api('/auth/me', { method: 'PUT', body: { notificationPrefs: { [key]: value } } })); toast('Preference saved', 'success'); }
    catch (err) { toast(err.message, 'error'); }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    try {
      await api('/auth/password', { method: 'PUT', body: pw });
      setPw({ currentPassword: '', newPassword: '' });
      toast('Password updated', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <>
      <h1>Settings</h1>

      <section className="card form" aria-labelledby="appearance">
        <h2 id="appearance">Appearance</h2>
        <button className="btn" onClick={toggleTheme}>{theme === 'light' ? <><Moon size={16} /> Switch to dark mode</> : <><Sun size={16} /> Switch to light mode</>}</button>
      </section>

      {user.role === 'patient' && (
        <section className="card form" aria-labelledby="notifs">
          <h2 id="notifs">Notifications</h2>
          <p className="muted">“Your turn” alerts are always on so you never miss your call.</p>
          {PREFS.map(([key, title, hint]) => (
            <label className="check" key={key}>
              <input type="checkbox" checked={prefs[key] !== false} onChange={(e) => setPref(key, e.target.checked)} />
              <span><strong>{title}</strong><br /><small className="muted">{hint}</small></span>
            </label>
          ))}
        </section>
      )}

      <form className="card form" onSubmit={changePassword}>
        <h2>Change password</h2>
        <label>Current password<input type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required /></label>
        <label>New password (8+ characters)<input type="password" autoComplete="new-password" minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required /></label>
        <button className="btn primary">Update password</button>
      </form>
    </>
  );
}
