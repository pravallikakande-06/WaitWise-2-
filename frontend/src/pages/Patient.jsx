import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Clock, Siren, Ticket } from 'lucide-react';
import { api } from '../services/api.js';
import { useFetch } from '../hooks/useFetch.js';
import { useApp } from '../context/Providers.jsx';
import { Async, Badge, Stat } from '../components/ui.jsx';

const STATUS = {
  waiting: ['info', '⏳ Waiting'], called: ['warn', '📣 Called: please go to the doctor'],
  in_consultation: ['success', '🩺 In consultation'], temporarily_away: ['warn', '🚶 Temporarily away'],
};
const CONF = { high: ['success', '🟢 High confidence'], moderate: ['warn', '🟡 Moderate confidence'], low: ['danger', '🔴 Low confidence'] };
const time = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const NoQueue = () => (
  <div className="card state"><p>You are not in a queue.</p><Link className="btn primary" to="/app/join">Join Queue</Link></div>
);

function QueueCard({ d, reload, actions }) {
  const { toast } = useApp();
  const { entry: e, prediction: p, leave } = d;
  const pct = p.patientsAhead === 0 ? 100 : Math.max(6, 100 - p.patientsAhead * 7);
  const away = e.status === 'temporarily_away';
  const [tone, label] = STATUS[e.status];
  const [cTone, cLabel] = CONF[p.confidence];

  const act = async (path, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    try { const r = await api(path, { method: 'POST' }); toast(r.message || 'Done', 'success'); reload(); }
    catch (err) { toast(err.message, 'error'); }
  };

  return (
    <section className="card queue-card" aria-label="Your queue status">
      <div className="row between">
        <div><span className="muted">YOUR TOKEN</span><div className="token">{e.tokenNumber}</div></div>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <div className="grid stats">
        <Stat label="Patients ahead" value={p.patientsAhead} />
        <Stat label="Estimated wait" value={`${p.minMinutes}–${p.maxMinutes} min`} />
        <Stat label="Current token" value={d.currentToken || '—'} />
        <Stat label="Served today" value={d.served} />
      </div>
      <div className="progress" role="progressbar" aria-label="Queue progress" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${pct}%` }} /></div>
      <div className="dots" aria-hidden="true">
        {Array.from({ length: Math.min(p.patientsAhead, 14) }, (_, i) => <i key={i} />)}<b className="pulse">YOU</b>
      </div>
      <p>Estimated turn: <strong>{time(p.estimatedTurnAt)}</strong> <Badge tone={cTone}>{cLabel}</Badge></p>
      <p className="muted"><small>{p.note}</small></p>
      {away && <div className="banner warn" role="status">You are temporarily away. Please return by <strong>{time(e.awayUntil)}</strong> or you will move to the back of the line.</div>}
      {actions && (
        <div className="row wrap">
          {away && <button className="btn primary" onClick={() => act('/queue/return')}>Return to Queue</button>}
          {leave.canLeave && !away && (
            <div className="banner info" style={{ flex: 1 }}>
              Your estimated wait is about {Math.round((p.minMinutes + p.maxMinutes) / 2)} minutes. You can temporarily leave the waiting area (up to {leave.awayMinutes} min).
              <div><button className="btn" onClick={() => act('/queue/leave', `Leave for up to ${leave.awayMinutes} minutes?`)}>Leave Queue Temporarily</button></div>
              <small className="muted">{leave.policy}</small>
            </div>
          )}
          {e.status !== 'in_consultation' && <button className="btn danger" onClick={() => act('/queue/cancel', 'Cancel your token?')}>Cancel Token</button>}
        </div>
      )}
    </section>
  );
}

export function PatientHome() {
  const { user } = useApp();
  const res = useFetch(() => api('/queue/my-status'), [], 8000);
  const h = new Date().getHours();
  return (
    <>
      <h1>{h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}, {user.name.split(' ')[0]} 👋</h1>
      <Async res={res}>{(d) => (d.active ? <QueueCard d={d} reload={res.reload} /> : <NoQueue />)}</Async>
      <Link className="btn" to="/app/queue" style={{ marginTop: 16 }}>Open live queue</Link>
    </>
  );
}

export function QueuePage() {
  const res = useFetch(() => api('/queue/my-status'), [], 5000);
  return (
    <>
      <h1>Live queue</h1>
      <Async res={res}>{(d) => (d.active ? <QueueCard d={d} reload={res.reload} actions /> : <NoQueue />)}</Async>
    </>
  );
}

function DeptCard({ dep }) {
  const { toast } = useApp();
  const nav = useNavigate();
  const [doctorId, setDoctorId] = useState(dep.doctors[0]?._id || '');
  const [appointmentType, setType] = useState('consultation');
  const [priority, setPriority] = useState(false);
  const [busy, setBusy] = useState(false);
  const doc = dep.doctors.find((x) => x._id === doctorId);

  const join = async () => {
    setBusy(true);
    try {
      const r = await api('/queue/join', { method: 'POST', body: { doctorId, appointmentType, priority: priority ? 'senior_or_pregnant' : 'normal' } });
      toast(`Token ${r.entry.tokenNumber} issued`, 'success');
      nav('/app/queue');
    } catch (err) { toast(err.message, 'error'); setBusy(false); }
  };

  return (
    <div className="card hover">
      <h3>{dep.name}</h3>
      <p className="muted">{dep.waiting} patients waiting · Est. wait {dep.estimatedWait} min</p>
      {dep.doctors.length ? (
        <>
          <label>Doctor<select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            {dep.doctors.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}</select></label>
          {doc?.delayMinutes > 0 && <small className="muted">⚠ Running about {doc.delayMinutes} min late</small>}
          <label>Appointment type<select value={appointmentType} onChange={(e) => setType(e.target.value)}>
            <option value="consultation">Consultation</option><option value="follow_up">Follow-up</option><option value="report_review">Report review</option></select></label>
          <label className="check"><input type="checkbox" checked={priority} onChange={(e) => setPriority(e.target.checked)} /> Senior citizen / pregnant</label>
          <button className="btn primary" onClick={join} disabled={busy}>{busy ? 'Joining…' : 'Join Queue'}</button>
        </>
      ) : <Badge tone="danger">No doctors available</Badge>}
    </div>
  );
}

export function JoinQueue() {
  const res = useFetch(() => api('/departments'));
  return (
    <>
      <h1>Join a queue</h1>
      <Async res={res} isEmpty={(d) => !d.length} emptyText="No departments are open right now.">
        {(d) => <div className="grid cards">{d.map((dep) => <DeptCard key={dep._id} dep={dep} />)}</div>}
      </Async>
    </>
  );
}

const ICON = { approaching: Clock, called: Siren, delay: Clock, return: Bell, update: Ticket };

export function Notifications() {
  const res = useFetch(() => api('/notifications'), [], 10000);
  useEffect(() => { if (res.data?.some((n) => !n.read)) api('/notifications/read', { method: 'POST' }).catch(() => {}); }, [res.data]);
  return (
    <>
      <h1>Notifications</h1>
      <Async res={res} isEmpty={(d) => !d.length} emptyText="You have no notifications yet.">
        {(d) => d.map((n) => {
          const Icon = ICON[n.type] || Bell;
          return (
            <div className={`card note ${n.read ? '' : 'unread'}`} key={n._id}>
              <Icon aria-hidden="true" color="var(--primary)" />
              <div><strong>{n.title}</strong><p>{n.message}</p><small className="muted">{new Date(n.createdAt).toLocaleString()}</small></div>
            </div>
          );
        })}
      </Async>
    </>
  );
}

export function Profile() {
  const { toast, updateUser } = useApp();
  const me = useFetch(() => api('/auth/me'));
  const visits = useFetch(() => api('/queue/history'));
  const [f, setF] = useState(null);
  useEffect(() => { if (me.data) setF({ name: me.data.name, phone: me.data.phone || '', dob: me.data.dob?.slice(0, 10) || '', emergencyContact: me.data.emergencyContact || '' }); }, [me.data]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    try { updateUser(await api('/auth/me', { method: 'PUT', body: f })); toast('Profile saved', 'success'); }
    catch (err) { toast(err.message, 'error'); }
  };

  return (
    <>
      <h1>Profile</h1>
      <Async res={me}>{(u) => f && (
        <form className="card form" onSubmit={save}>
          <label>Name<input value={f.name} onChange={set('name')} required /></label>
          <label>Email<input value={u.email} disabled /></label>
          <label>Phone<input value={f.phone} onChange={set('phone')} /></label>
          <label>Date of birth<input type="date" value={f.dob} onChange={set('dob')} /></label>
          <label>Emergency contact<input value={f.emergencyContact} onChange={set('emergencyContact')} /></label>
          <button className="btn primary">Save changes</button>
        </form>
      )}</Async>
      <h2>My visits</h2>
      <Async res={visits} isEmpty={(d) => !d.length} emptyText="No completed visits yet.">
        {(d) => (
          <table className="table card"><thead><tr><th>Date</th><th>Department</th><th>Doctor</th><th>Wait time</th></tr></thead>
            <tbody>{d.map((v, i) => (
              <tr key={i}><td data-label="Date">{new Date(v.date).toLocaleDateString([], { day: '2-digit', month: 'short' })}</td>
                <td data-label="Department">{v.department}</td><td data-label="Doctor">{v.doctor}</td><td data-label="Wait time">{v.waitMinutes} min</td></tr>
            ))}</tbody></table>
        )}
      </Async>
    </>
  );
}
