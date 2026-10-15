import { Link } from 'react-router-dom';
import { Activity, BarChart3, Bell, Building2, Clock, Siren, Ticket } from 'lucide-react';

const features = [
  [Clock, 'Wait-Time Prediction', 'A range, not a guess, with a confidence level.'],
  [Ticket, 'Digital Queue', 'Get a token and see your position live.'],
  [Bell, 'Smart Notifications', 'Be told when your turn is approaching.'],
  [Building2, 'Hospital Dashboard', 'Staff see every department at a glance.'],
  [BarChart3, 'Queue Analytics', 'Waiting times, load and peak hours.'],
  [Siren, 'Emergency Priority', 'Tracked, authorised and never silent.'],
];
const steps = ['Register', 'Select Department', 'Join Queue', 'Get Token', 'Track Queue', 'Get Notified', 'Meet Doctor'];

export default function Landing() {
  return (
    <div className="landing">
      <header className="top"><span className="brand"><Activity size={22} aria-hidden="true" /> WaitWise</span>
        <div className="top-actions"><Link className="btn" to="/login">Login</Link><Link className="btn primary" to="/register">Get Started</Link></div>
      </header>
      <section className="hero">
        <div>
          <p className="eyebrow">WAITWISE</p>
          <h1>Know your wait.<br />Manage your time.</h1>
          <p className="lead">Smart hospital queue management with intelligent wait-time prediction.</p>
          <div className="row"><Link className="btn primary" to="/app/join">Join Queue</Link><Link className="btn" to="/login">Explore Dashboard</Link></div>
        </div>
        <div className="mock card" aria-label="Sample dashboard preview (demo)">
          <small className="muted">Sample preview · demo data</small>
          <div className="mock-token">CAR-047</div>
          <div className="row between"><span>12 patients ahead</span><strong>38–45 min</strong></div>
          <div className="progress"><span style={{ width: '62%' }} /></div>
          <span className="badge success">🟢 High confidence</span>
          <div className="float f1"><strong>↓ 32%</strong><small>Avg waiting time</small></div>
          <div className="float f2"><strong>98%</strong><small>Queue visibility</small></div>
          <div className="float f3"><strong>24/7</strong><small>Real-time monitoring</small></div>
        </div>
      </section>
      <p className="muted center"><small>Statistics shown on this page are demo values, not real-world claims.</small></p>
      <section className="section"><h2>The problem</h2><p className="lead center">Patients often spend hours waiting without knowing when their turn will arrive.</p></section>
      <section className="section"><h2>The solution</h2>
        <div className="grid cards"><div className="card center">Real-Time Queue</div><div className="card center">+ Smart Prediction</div><div className="card center">+ Notifications</div></div></section>
      <section className="section"><h2>Features</h2>
        <div className="grid cards">{features.map(([Icon, t, d]) => <div className="card hover" key={t}><Icon color="var(--primary)" aria-hidden="true" /><h3>{t}</h3><p className="muted">{d}</p></div>)}</div></section>
      <section className="section"><h2>How it works</h2>
        <ol className="steps">{steps.map((s) => <li key={s}>{s}</li>)}</ol></section>
      <footer className="footer"><strong>WaitWise</strong>
        <nav aria-label="Footer"><a href="#top">About</a><a href="#top">Features</a><a href="mailto:contact@example.com">Contact</a><a href="#top">Privacy</a><a href="#top">Terms</a></nav>
        <small className="muted">Predictions are estimates and not medical advice.</small></footer>
    </div>
  );
}
