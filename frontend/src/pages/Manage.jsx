import { useState } from 'react';
import { api } from '../services/api.js';
import { useFetch } from '../hooks/useFetch.js';
import { useApp } from '../context/Providers.jsx';
import { Async, Badge } from '../components/ui.jsx';

const send = (path, method, body) => api(path, { method, body });

// Runs an API call, shows a toast, then refreshes the list.
function useAction(reload) {
  const { toast } = useApp();
  return async (fn, msg) => {
    try { await fn(); toast(msg, 'success'); reload(); } catch (err) { toast(err.message, 'error'); }
  };
}

export function Doctors() {
  const { user } = useApp();
  const isAdmin = user.role === 'admin';
  const docs = useFetch(() => api('/doctors'));
  const depts = useFetch(() => api('/admin/departments'));
  const run = useAction(docs.reload);
  const [f, setF] = useState({ name: '', specialization: '', department: '', averageConsultationTime: 10 });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <h1>Doctors</h1>
      {isAdmin && (
        <Async res={depts}>{(d) => (
          <form className="card form" onSubmit={(e) => { e.preventDefault(); run(() => send('/admin/doctors', 'POST', { ...f, averageConsultationTime: +f.averageConsultationTime }), 'Doctor added'); }}>
            <label>Name<input value={f.name} onChange={set('name')} required /></label>
            <label>Specialization<input value={f.specialization} onChange={set('specialization')} /></label>
            <label>Department<select value={f.department} onChange={set('department')} required><option value="">Select…</option>{d.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}</select></label>
            <label>Avg consultation (min)<input type="number" min="1" value={f.averageConsultationTime} onChange={set('averageConsultationTime')} /></label>
            <button className="btn primary">Add doctor</button>
          </form>
        )}</Async>
      )}
      <Async res={docs} isEmpty={(d) => !d.length} emptyText="No doctors have been added yet.">{(d) => (
        <table className="table card"><thead><tr><th>Name</th><th>Department</th><th>Avg consult</th><th>Delay</th><th>Status</th></tr></thead>
          <tbody>{d.map((x) => (
            <tr key={x._id}><td data-label="Name">{x.name}</td><td data-label="Department">{x.department?.name}</td>
              <td data-label="Avg consult">{isAdmin
                ? <input type="number" min="1" defaultValue={x.averageConsultationTime} aria-label={`Average consultation minutes for ${x.name}`} onBlur={(e) => +e.target.value !== x.averageConsultationTime && run(() => send(`/admin/doctors/${x._id}`, 'PUT', { averageConsultationTime: +e.target.value }), 'Saved')} />
                : `${x.averageConsultationTime} min`}</td>
              <td data-label="Delay">{x.delayMinutes} min</td>
              <td data-label="Status">{isAdmin
                ? <select value={x.status} aria-label={`Status for ${x.name}`} onChange={(e) => run(() => send(`/admin/doctors/${x._id}`, 'PUT', { status: e.target.value }), 'Status updated')}>
                  <option value="available">Available</option><option value="busy">Busy</option><option value="off_duty">Off duty</option></select>
                : <Badge tone={x.status === 'off_duty' ? 'danger' : 'success'}>{x.status.replace('_', ' ')}</Badge>}</td></tr>
          ))}</tbody></table>
      )}</Async>
    </>
  );
}

export function Departments() {
  const { user } = useApp();
  const isAdmin = user.role === 'admin';
  const res = useFetch(() => api('/admin/departments'));
  const run = useAction(res.reload);
  const [f, setF] = useState({ name: '', code: '', description: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <h1>Departments</h1>
      {isAdmin && (
        <form className="card form" onSubmit={(e) => { e.preventDefault(); run(() => send('/admin/departments', 'POST', f), 'Department added'); }}>
          <label>Name<input value={f.name} onChange={set('name')} required /></label>
          <label>Token code (2–4 letters)<input value={f.code} onChange={set('code')} maxLength={4} required /></label>
          <label>Description<input value={f.description} onChange={set('description')} /></label>
          <button className="btn primary">Add department</button>
        </form>
      )}
      <Async res={res} isEmpty={(d) => !d.length} emptyText="No departments yet.">{(d) => (
        <table className="table card"><thead><tr><th>Name</th><th>Code</th><th>Status</th>{isAdmin && <th>Action</th>}</tr></thead>
          <tbody>{d.map((x) => (
            <tr key={x._id}><td data-label="Name">{x.name}</td><td data-label="Code">{x.code}</td>
              <td data-label="Status"><Badge tone={x.status === 'active' ? 'success' : 'danger'}>{x.status === 'active' ? '🟢 Active' : '⛔ Closed'}</Badge></td>
              {isAdmin && <td data-label="Action"><button className="btn sm" onClick={() => run(() => send(`/admin/departments/${x._id}`, 'PUT', { status: x.status === 'active' ? 'closed' : 'active' }), 'Department updated')}>{x.status === 'active' ? 'Close' : 'Reopen'}</button></td>}</tr>
          ))}</tbody></table>
      )}</Async>
    </>
  );
}

export function Patients() {
  const res = useFetch(() => api('/admin/patients'));
  return (
    <>
      <h1>Patients</h1>
      <Async res={res} isEmpty={(d) => !d.length} emptyText="No registered patients yet.">{(d) => (
        <table className="table card"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Registered</th></tr></thead>
          <tbody>{d.map((p) => (
            <tr key={p._id}><td data-label="Name">{p.name}</td><td data-label="Email">{p.email}</td><td data-label="Phone">{p.phone || '—'}</td>
              <td data-label="Registered">{new Date(p.createdAt).toLocaleDateString()}</td></tr>
          ))}</tbody></table>
      )}</Async>
    </>
  );
}

const A_TONE = { scheduled: 'info', checked_in: 'success', completed: 'success', cancelled: 'danger', no_show: 'warn' };

export function Appointments() {
  const list = useFetch(() => api('/admin/appointments'), [], 15000);
  const pts = useFetch(() => api('/admin/patients'));
  const docs = useFetch(() => api('/doctors'));
  const run = useAction(list.reload);
  const [f, setF] = useState({ patientId: '', doctorId: '', scheduledFor: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setStatus = (a, status, msg) => run(() => send(`/admin/appointments/${a._id}`, 'PUT', { status }), msg);

  return (
    <>
      <h1>Appointments</h1>
      <Async res={pts}>{(p) => (
        <Async res={docs}>{(d) => (
          <form className="card form" onSubmit={(e) => { e.preventDefault(); run(() => send('/admin/appointments', 'POST', f), 'Appointment booked'); }}>
            <label>Patient<select value={f.patientId} onChange={set('patientId')} required><option value="">Select…</option>{p.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}</select></label>
            <label>Doctor<select value={f.doctorId} onChange={set('doctorId')} required><option value="">Select…</option>{d.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}</select></label>
            <label>Date and time<input type="datetime-local" value={f.scheduledFor} onChange={set('scheduledFor')} required /></label>
            <button className="btn primary">Book appointment</button>
          </form>
        )}</Async>
      )}</Async>
      <Async res={list} isEmpty={(d) => !d.length} emptyText="No appointments scheduled.">{(d) => (
        <table className="table card"><thead><tr><th>When</th><th>Patient</th><th>Doctor</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{d.map((a) => (
            <tr key={a._id}><td data-label="When">{new Date(a.scheduledFor).toLocaleString()}</td><td data-label="Patient">{a.patientId?.name}</td><td data-label="Doctor">{a.doctorId?.name}</td>
              <td data-label="Status"><Badge tone={A_TONE[a.status]}>{a.status.replace('_', ' ')}</Badge></td>
              <td data-label="Actions" className="actions">
                {a.status === 'scheduled' && <>
                  <button className="btn sm primary" onClick={() => setStatus(a, 'checked_in', 'Checked in, token issued')}>Check in</button>
                  <button className="btn sm" onClick={() => setStatus(a, 'no_show', 'Marked no-show')}>No-show</button>
                  <button className="btn sm danger" onClick={() => setStatus(a, 'cancelled', 'Appointment cancelled')}>Cancel</button></>}
                {a.status === 'checked_in' && <button className="btn sm" onClick={() => setStatus(a, 'completed', 'Marked completed')}>Complete</button>}
              </td></tr>
          ))}</tbody></table>
      )}</Async>
    </>
  );
}
