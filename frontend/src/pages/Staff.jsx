import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../services/api.js';
import { useFetch } from '../hooks/useFetch.js';
import { useApp } from '../context/Providers.jsx';
import { Async, Badge, Stat } from '../components/ui.jsx';

const post = (path, body) => api(path, { method: 'POST', body });
const LOAD = { busy: ['danger', '🔴 Busy'], moderate: ['warn', '🟡 Moderate'], normal: ['success', '🟢 Normal'] };
const STATUS = { waiting: ['info', '⏳ Waiting'], called: ['warn', '📣 Called'], in_consultation: ['success', '🩺 In consultation'], temporarily_away: ['warn', '🚶 Away'] };

export function StaffDashboard() {
  const res = useFetch(() => api('/admin/dashboard'), [], 10000);
  return (
    <>
      <h1>Hospital overview</h1>
      <Async res={res}>{(d) => (
        <>
          <div className="grid stats">
            <Stat label="Patients today" value={d.totalToday} /><Stat label="Currently waiting" value={d.waiting} />
            <Stat label="Doctors available" value={d.doctorsAvailable} />
          </div>
          <h2>Live department status</h2>
          <table className="table card"><thead><tr><th>Department</th><th>Waiting</th><th>Avg wait</th><th>Status</th></tr></thead>
            <tbody>{d.departments.map((x) => (
              <tr key={x.name}><td data-label="Department">{x.name}</td><td data-label="Waiting">{x.waiting}</td><td data-label="Avg wait">{x.avgWait} min</td>
                <td data-label="Status"><Badge tone={LOAD[x.status][0]}>{LOAD[x.status][1]}</Badge></td></tr>
            ))}</tbody></table>
        </>
      )}</Async>
    </>
  );
}

function QueueBoard({ doctors, initial }) {
  const { toast } = useApp();
  const [sel, setSel] = useState(initial);
  const [delay, setDelay] = useState(15);
  const q = useFetch(() => api('/admin/queues?doctorId=' + sel), [sel], 6000);
  const doc = doctors.find((d) => d._id === sel);

  const run = async (path, body, msg) => {
    try { await post(path, body); toast(msg, 'success'); q.reload(); } catch (err) { toast(err.message, 'error'); }
  };
  const current = q.data?.find((r) => ['called', 'in_consultation'].includes(r.status));
  const btn = (label, path, r, msg, cls = '') => <button className={`btn sm ${cls}`} onClick={() => run(path, { queueId: r._id }, msg)}>{label}</button>;

  return (
    <>
      <div className="card row wrap">
        <label>Doctor<select value={sel} onChange={(e) => setSel(e.target.value)}>{doctors.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}</select></label>
        <div><span className="muted">Current patient</span><br /><strong>{current?.tokenNumber || '—'}</strong></div>
        <div><span className="muted">Waiting</span><br /><strong>{q.data ? q.data.filter((r) => r.status === 'waiting').length : '…'}</strong></div>
        <div><span className="muted">Avg consultation</span><br /><strong>{doc.averageConsultationTime} min</strong></div>
        <button className="btn primary" onClick={() => run('/admin/queue/call-next', { doctorId: sel }, 'Next patient called')}>Call Next Patient</button>
      </div>
      <div className="card row wrap">
        <label>Delay (minutes)<input type="number" min="0" value={delay} onChange={(e) => setDelay(e.target.value)} /></label>
        <button className="btn" onClick={() => run('/admin/doctor/delay', { doctorId: sel, minutes: delay }, 'Delay set, waiting patients notified')}>Mark Delayed</button>
        <button className="btn" onClick={() => run('/admin/doctor/delay', { doctorId: sel, minutes: 0 }, 'Delay cleared')}>Clear delay</button>
      </div>
      <Async res={q} isEmpty={(d) => !d.length} emptyText="No patients are currently waiting.">{(rows) => (
        <table className="table card"><thead><tr><th>Token</th><th>Patient</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r._id}>
              <td data-label="Token">{r.priority === 'emergency' && '🚨 '}<strong>{r.tokenNumber}</strong></td>
              <td data-label="Patient">{r.patientId?.name}</td>
              <td data-label="Status"><Badge tone={STATUS[r.status][0]}>{STATUS[r.status][1]}</Badge></td>
              <td data-label="Actions" className="actions">
                {r.status === 'called' && btn('Start', '/admin/queue/start', r, 'Consultation started', 'primary')}
                {['called', 'in_consultation'].includes(r.status) && btn('Complete', '/admin/queue/complete', r, 'Consultation completed')}
                {r.status === 'waiting' && btn('Skip', '/admin/queue/skip', r, 'Patient moved to back')}
                {['waiting', 'temporarily_away'].includes(r.status) && btn('Notify', '/admin/queue/notify', r, 'Patient notified')}
                {r.status !== 'in_consultation' && btn('Cancel', '/admin/queue/cancel', r, 'Entry cancelled', 'danger')}
              </td>
            </tr>
          ))}</tbody></table>
      )}</Async>
    </>
  );
}

export function StaffQueues() {
  const { user } = useApp();
  const docs = useFetch(() => api('/doctors'));
  return (
    <>
      <h1>Live queues</h1>
      <Async res={docs} isEmpty={(d) => !d.length} emptyText="No doctors found.">
        {(d) => <QueueBoard doctors={d} initial={user.doctorId || d[0]._id} />}
      </Async>
    </>
  );
}

export function StaffEmergency() {
  const { toast } = useApp();
  const pts = useFetch(() => api('/admin/patients'));
  const docs = useFetch(() => api('/doctors'));
  const list = useFetch(() => api('/admin/queues'), [], 8000);
  const [f, setF] = useState({ patientId: '', doctorId: '', reason: '', level: '2' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    try { await post('/admin/queue/emergency', { ...f, level: +f.level }); toast('Emergency case created', 'success'); setF({ ...f, reason: '' }); list.reload(); }
    catch (err) { toast(err.message, 'error'); }
  };

  return (
    <>
      <h1>🚨 Emergency cases</h1>
      <Async res={pts}>{(p) => (
        <Async res={docs}>{(d) => (
          <form className="card form" onSubmit={submit}>
            <label>Patient<select value={f.patientId} onChange={set('patientId')} required><option value="">Select…</option>{p.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}</select></label>
            <label>Doctor<select value={f.doctorId} onChange={set('doctorId')} required><option value="">Select…</option>{d.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}</select></label>
            <label>Priority level<select value={f.level} onChange={set('level')}><option value="1">1 – Urgent</option><option value="2">2 – Critical</option><option value="3">3 – Life-threatening</option></select></label>
            <label>Reason / category<input value={f.reason} onChange={set('reason')} required /></label>
            <button className="btn danger">Create emergency entry</button>
          </form>
        )}</Async>
      )}</Async>
      <h2>Active emergencies</h2>
      <Async res={list} isEmpty={(d) => !d.some((r) => r.priority === 'emergency')} emptyText="No active emergency cases.">
        {(d) => (
          <table className="table card"><thead><tr><th>Token</th><th>Patient</th><th>Level</th><th>Reason</th><th>Time</th></tr></thead>
            <tbody>{d.filter((r) => r.priority === 'emergency').map((r) => (
              <tr key={r._id}><td data-label="Token">🚨 {r.tokenNumber}</td><td data-label="Patient">{r.patientId?.name}</td><td data-label="Level">{r.emergency?.level}</td>
                <td data-label="Reason">{r.emergency?.reason}</td><td data-label="Time">{new Date(r.emergency?.at).toLocaleTimeString()}</td></tr>
            ))}</tbody></table>
        )}
      </Async>
    </>
  );
}

const axis = { stroke: '#64748b', fontSize: 12 };
export function StaffAnalytics() {
  const a = useFetch(() => api('/analytics'));
  const dash = useFetch(() => api('/admin/dashboard'));
  return (
    <>
      <h1>Analytics</h1>
      <Async res={a}>{(d) => {
        const hours = d.perHour.filter((h) => h.hour >= 6 && h.hour <= 22).map((h) => ({ ...h, label: `${h.hour}:00` }));
        return (
          <>
            <div className="grid stats">
              <Stat label="Average wait" value={`${d.averageWait} min`} /><Stat label="Maximum wait" value={`${d.maxWait} min`} />
              <Stat label="Avg consultation" value={`${d.averageConsultation} min`} /><Stat label="Patients served (7d)" value={d.patientsServed} />
              <Stat label="No-show / cancelled" value={`${Math.round(d.noShowRate * 100)}%`} />
            </div>
            <div className="grid cards">
              <div className="card"><h3>Average waiting time by hour</h3><ResponsiveContainer width="100%" height={240}>
                <LineChart data={hours}><CartesianGrid strokeDasharray="3 3" stroke="#94a3b855" /><XAxis dataKey="label" {...axis} /><YAxis {...axis} /><Tooltip /><Line type="monotone" dataKey="avgWait" name="Avg wait (min)" stroke="#6366f1" strokeWidth={3} dot={false} /></LineChart></ResponsiveContainer></div>
              <div className="card"><h3>Patients per hour (peak hours)</h3><ResponsiveContainer width="100%" height={240}>
                <BarChart data={hours}><CartesianGrid strokeDasharray="3 3" stroke="#94a3b855" /><XAxis dataKey="label" {...axis} /><YAxis {...axis} allowDecimals={false} /><Tooltip /><Bar dataKey="patients" fill="#0d9488" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
            </div>
          </>
        );
      }}</Async>
      <Async res={dash}>{(d) => (
        <div className="card"><h3>Department load (patients waiting)</h3><ResponsiveContainer width="100%" height={260}>
          <BarChart data={d.departments}><CartesianGrid strokeDasharray="3 3" stroke="#94a3b855" /><XAxis dataKey="name" {...axis} /><YAxis {...axis} allowDecimals={false} /><Tooltip /><Bar dataKey="waiting" fill="#6366f1" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
      )}</Async>
    </>
  );
}
