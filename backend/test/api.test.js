process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const { User, Department, Doctor, Notification } = require('../models');

let mongod, doctor, staff;
const patients = {};
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const json = (r) => r.body;

async function register(n) {
  const r = await request(app).post('/api/auth/register').send({ name: `P${n}`, email: `p${n}@test.dev`, password: 'password123' });
  assert.equal(r.status, 201);
  patients[n] = json(r);
  return patients[n].token;
}
const join = (n) => request(app).post('/api/queue/join').set(auth(patients[n].token)).send({ doctorId: String(doctor._id) });

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const dept = await Department.create({ name: 'Cardiology', code: 'CAR' });
  doctor = await Doctor.create({ name: 'Dr. Test', department: dept._id, averageConsultationTime: 10 });
  await User.create({ name: 'Staff', email: 'staff@test.dev', role: 'staff', password: await bcrypt.hash('password123', 4) });
  const r = await request(app).post('/api/auth/login').send({ email: 'staff@test.dev', password: 'password123' });
  staff = json(r);
});
after(async () => { await mongoose.disconnect(); await mongod.stop(); });

test('registration rejects weak input', async () => {
  const r = await request(app).post('/api/auth/register').send({ name: 'X', email: 'not-an-email', password: '123' });
  assert.equal(r.status, 400);
});

test('login works and wrong password is refused', async () => {
  await register(1);
  const ok = await request(app).post('/api/auth/login').send({ email: 'p1@test.dev', password: 'password123' });
  assert.equal(ok.status, 200);
  const bad = await request(app).post('/api/auth/login').send({ email: 'p1@test.dev', password: 'wrong-password' });
  assert.equal(bad.status, 401);
});

test('role-based protection', async () => {
  assert.equal((await request(app).get('/api/admin/queues')).status, 401);
  assert.equal((await request(app).get('/api/admin/queues').set(auth(patients[1].token))).status, 403);
  assert.equal((await request(app).get('/api/admin/queues').set(auth(staff.token))).status, 200);
});

test('joining gives a token and a wait range; double joining is blocked', async () => {
  await register(2);
  const r = await join(2);
  assert.equal(r.status, 201);
  assert.match(r.body.entry.tokenNumber, /^CAR-\d{3}$/);
  assert.ok(r.body.prediction.minMinutes <= r.body.prediction.maxMinutes);
  assert.equal((await join(2)).status, 409);
});

test('estimated wait grows with patients ahead', async () => {
  await register(3); await register(4);
  const a = (await join(3)).body.prediction;
  const b = (await join(4)).body.prediction;
  assert.equal(a.patientsAhead, 1);
  assert.equal(b.patientsAhead, 2);
  assert.ok(b.maxMinutes > a.maxMinutes);
});

test('short waits cannot leave the queue', async () => {
  const r = await request(app).post('/api/queue/leave').set(auth(patients[2].token));
  assert.equal(r.status, 400);
});

test('staff can call, start and complete a consultation', async () => {
  const call = await request(app).post('/api/admin/queue/call-next').set(auth(staff.token)).send({ doctorId: String(doctor._id) });
  assert.equal(call.status, 200);
  assert.equal(call.body.status, 'called');
  const queueId = call.body._id;
  assert.equal((await request(app).post('/api/admin/queue/start').set(auth(staff.token)).send({ queueId })).status, 200);
  assert.equal((await request(app).post('/api/admin/queue/complete').set(auth(staff.token)).send({ queueId })).status, 200);
  const status = await request(app).get('/api/queue/my-status').set(auth(patients[2].token));
  assert.equal(status.body.active, false);
});

test('patient can leave temporarily and return when the wait is long', async () => {
  await register(5); await register(6);
  await join(5); await join(6);
  const leave = await request(app).post('/api/queue/leave').set(auth(patients[6].token));
  assert.equal(leave.status, 200);
  assert.equal(leave.body.entry.status, 'temporarily_away');
  const back = await request(app).post('/api/queue/return').set(auth(patients[6].token));
  assert.equal(back.status, 200);
  assert.equal(back.body.movedToBack, false);
});

test('notification preferences are respected', async () => {
  const save = await request(app).put('/api/auth/me').set(auth(patients[4].token)).send({ notificationPrefs: { delay: false } });
  assert.equal(save.status, 200);
  await request(app).post('/api/admin/doctor/delay').set(auth(staff.token)).send({ doctorId: String(doctor._id), minutes: 20 });
  assert.equal(await Notification.countDocuments({ userId: patients[4].user.id, type: 'delay' }), 0);
  assert.ok(await Notification.countDocuments({ userId: patients[3].user.id, type: 'delay' }) >= 1);
});

test('emergencies are validated and record who authorised them', async () => {
  const bad = await request(app).post('/api/admin/queue/emergency').set(auth(staff.token))
    .send({ patientId: patients[1].user.id, doctorId: String(doctor._id), reason: 'Chest pain', level: 5 });
  assert.equal(bad.status, 400);
  const ok = await request(app).post('/api/admin/queue/emergency').set(auth(staff.token))
    .send({ patientId: patients[1].user.id, doctorId: String(doctor._id), reason: 'Chest pain', level: 3 });
  assert.equal(ok.status, 201);
  assert.equal(String(ok.body.emergency.authorizedBy), staff.user.id);
});

test('password change needs the current password', async () => {
  const bad = await request(app).put('/api/auth/password').set(auth(patients[1].token)).send({ currentPassword: 'nope-nope', newPassword: 'newpassword1' });
  assert.equal(bad.status, 400);
  const ok = await request(app).put('/api/auth/password').set(auth(patients[1].token)).send({ currentPassword: 'password123', newPassword: 'newpassword1' });
  assert.equal(ok.status, 200);
});
