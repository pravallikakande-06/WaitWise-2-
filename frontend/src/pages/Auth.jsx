import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { useApp } from '../context/Providers.jsx';

export default function Auth({ mode }) {
  const { login, register } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  const [f, setF] = useState({ name: '', email: '', password: '', phone: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isLogin = mode === 'login';
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const user = await (isLogin ? login : register)(f);
      nav(loc.state?.from || (user.role === 'patient' ? '/app' : '/staff'), { replace: true });
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  return (
    <div className="auth-wrap">
      <form className="card auth" onSubmit={submit} noValidate>
        <Link to="/" className="brand"><Activity size={22} aria-hidden="true" /> WaitWise</Link>
        <h1>{isLogin ? 'Welcome back' : 'Create your account'}</h1>
        {error && <p className="error" role="alert">{error}</p>}
        {!isLogin && <label>Full name<input value={f.name} onChange={set('name')} required autoComplete="name" /></label>}
        <label>Email<input type="email" value={f.email} onChange={set('email')} required autoComplete="email" /></label>
        {!isLogin && <label>Phone (optional)<input value={f.phone} onChange={set('phone')} autoComplete="tel" /></label>}
        <label>Password{!isLogin && ' (8+ characters)'}<input type="password" value={f.password} onChange={set('password')} required autoComplete={isLogin ? 'current-password' : 'new-password'} /></label>
        <button className="btn primary" disabled={busy}>{busy ? 'Please wait…' : isLogin ? 'Log in' : 'Register'}</button>
        <p className="muted">{isLogin ? <>New here? <Link to="/register">Create an account</Link></> : <>Have an account? <Link to="/login">Log in</Link></>}</p>
      </form>
    </div>
  );
}
