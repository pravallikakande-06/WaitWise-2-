const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { User, Department, Doctor, Queue, Notification, Appointment } = require('../models');
const { protect, allow } = require('../middleware/auth');
const { predictWait, doctorQueue, ACTIVE } = require('../services/prediction');
const { notify, notifyApproaching } = require('../services/notify');

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ message: 'Something went wrong.' }); });
const staff = [protect, allow('staff', 'admin', 'doctor')];
const MIN_WAIT_TO_LEAVE = 30; // minutes: shorter waits cannot leave
const MAX_AWAY_MINUTES = 30;  // hard cap on one absence
const MAX_AWAY_TIMES = 2;     // per visit
const sign = (u) => jwt.sign({ id: u._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, phone: u.phone, dob: u.dob, emergencyContact: u.emergencyContact, doctorId: u.doctorId, notificationPrefs: u.notificationPrefs });

// ---------- Auth ----------
router.post('/auth/register', validate([body('name').isString().trim().notEmpty().withMessage('Name is required.'), body('email').isEmail().withMessage('A valid email is required.'), body('password').isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')]), wrap(async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !/^\S+@\S+\.\S+$/.test(email || '') || (password || '').length < 8)
    return res.status(400).json({ message: 'Name, a valid email and a password of 8+ characters are required.' });
  if (await User.exists({ email: email.toLowerCase() })) return res.status(409).json({ message: 'Email already registered.' });
  const user = await User.create({ name, email, phone, password: await bcrypt.hash(password, 12), role: 'patient' });
  res.status(201).json({ token: sign(user), user: publicUser(user) });
}));

router.post('/auth/login', validate([body('email').isEmail().withMessage('A valid email is required.'), body('password').isString().notEmpty().withMessage('Password is required.')]), wrap(async (req, res) => {
  const user = await User.findOne({ email: (req.body.email || '').toLowerCase() }).select('+password');
  if (!user || !(await bcrypt.compare(req.body.password || '', user.password)))
    return res.status(401).json({ message: 'Incorrect email or password.' });
  res.json({ token: sign(user), user: publicUser(user) });
}));

router.post('/auth/logout', protect, (req, res) => res.json({ message: 'Logged out. Discard the token on the client.' }));

router.get('/auth/me', protect, (req, res) => res.json(publicUser(req.user)));
router.put('/auth/me', protect, validate([body('name').optional().isString().trim().notEmpty(), body('notificationPrefs').optional().isObject()]), wrap(async (req, res) => {
  for (const k of ['name', 'phone', 'emergencyContact']) if (typeof req.body[k] === 'string') req.user[k] = req.body[k];
  if (req.body.dob !== undefined) req.user.dob = req.body.dob || undefined;
  for (const [k, v] of Object.entries(req.body.notificationPrefs || {})) {
    if (typeof v === 'boolean' && ['approaching', 'delay', 'return', 'update'].includes(k)) req.user.set(`notificationPrefs.${k}`, v);
  }
  await req.user.save();
  res.json(publicUser(req.user));
}));

router.put('/auth/password', protect, validate([body('currentPassword').isString().notEmpty(), body('newPassword').isString().isLength({ min: 8 }).withMessage('New password must be at least 8 characters.')]), wrap(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (!(await bcrypt.compare(req.body.currentPassword, user.password))) return res.status(400).json({ message: 'Current password is incorrect.' });
  user.password = await bcrypt.hash(req.body.newPassword, 12);
  await user.save();
  res.json({ message: 'Password updated.' });
}));

// ---------- Public data ----------
router.get('/departments', wrap(async (req, res) => {
  const depts = await Department.find({ status: 'active' }).lean();
  const out = await Promise.all(depts.map(async (d) => {
    const doctors = await Doctor.find({ department: d._id, status: { $ne: 'off_duty' } }).lean();
    const waiting = await Queue.countDocuments({ departmentId: d._id, status: { $in: ACTIVE } });
    const avg = doctors.length ? doctors.reduce((s, x) => s + x.averageConsultationTime, 0) / doctors.length : 0;
    return { ...d, doctors, waiting, estimatedWait: Math.round((waiting / Math.max(doctors.length, 1)) * avg) };
  }));
  res.json(out);
}));

router.get('/doctors', wrap(async (req, res) => {
  const filter = req.query.department ? { department: req.query.department } : {};
  res.json(await Doctor.find(filter).populate('department', 'name code'));
}));

// ---------- Patient queue ----------
async function nextToken(dept) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const n = (await Queue.countDocuments({ departmentId: dept._id, joinedAt: { $gte: start } })) + 1;
  return `${dept.code}-${String(n).padStart(3, '0')}`;
}

router.post('/queue/join', protect, allow('patient'), validate([body('doctorId').isMongoId().withMessage('A valid doctorId is required.'), body('appointmentType').optional().isIn(['consultation', 'follow_up', 'report_review']).withMessage('Invalid appointment type.')]), wrap(async (req, res) => {
  const { doctorId, appointmentType, priority } = req.body;
  if (await Queue.exists({ patientId: req.user._id, status: { $in: ACTIVE } }))
    return res.status(409).json({ message: 'You are already in a queue.' });
  const doctor = await Doctor.findById(doctorId);
  if (!doctor || doctor.status === 'off_duty') return res.status(400).json({ message: 'This doctor is not available.' });
  const dept = await Department.findById(doctor.department);
  // Patients may only request the senior/pregnant priority; emergencies are authorised by staff.
  const entry = await Queue.create({
    tokenNumber: await nextToken(dept), patientId: req.user._id, doctorId, departmentId: dept._id,
    appointmentType, priority: priority === 'senior_or_pregnant' ? priority : 'normal',
  });
  const p = await predictWait(entry);
  entry.estimatedWait = Math.round((p.minMinutes + p.maxMinutes) / 2);
  await entry.save();
  await notify(req.user._id, 'Token issued', `Your token is ${entry.tokenNumber}.`);
  res.status(201).json({ entry, prediction: p });
}));

const myEntry = (userId, statuses = ACTIVE) => Queue.findOne({ patientId: userId, status: { $in: statuses } }).populate('doctorId departmentId');

router.get('/queue/my-status', protect, wrap(async (req, res) => {
  const entry = await myEntry(req.user._id);
  if (!entry) return res.json({ active: false });
  const prediction = await predictWait(entry);
  const current = await Queue.findOne({ doctorId: entry.doctorId._id, status: { $in: ['called', 'in_consultation'] } }).sort({ calledAt: -1 });
  const served = await Queue.countDocuments({ doctorId: entry.doctorId._id, status: 'completed', completedAt: { $gte: new Date().setHours(0, 0, 0, 0) } });
  const avg = (prediction.minMinutes + prediction.maxMinutes) / 2;
  const canLeave = entry.status === 'waiting' && avg >= MIN_WAIT_TO_LEAVE && entry.awayCount < MAX_AWAY_TIMES;
  const awayMinutes = Math.min(MAX_AWAY_MINUTES, Math.max(0, Math.round(avg - 10)));
  res.json({
    active: true, entry, prediction, currentToken: current?.tokenNumber || null, served,
    leave: { canLeave, awayMinutes, policy: `Allowed when the wait is ${MIN_WAIT_TO_LEAVE}+ min, up to ${MAX_AWAY_MINUTES} min, ${MAX_AWAY_TIMES} times per visit. Returning late moves you to the back of the line.` },
  });
}));

router.post('/queue/leave', protect, wrap(async (req, res) => {
  const entry = await myEntry(req.user._id, ['waiting']);
  if (!entry) return res.status(400).json({ message: 'You are not waiting in a queue.' });
  const p = await predictWait(entry);
  if ((p.minMinutes + p.maxMinutes) / 2 < MIN_WAIT_TO_LEAVE || entry.awayCount >= MAX_AWAY_TIMES)
    return res.status(400).json({ message: 'Your wait is too short, or you have used all temporary absences.' });
  const minutes = Math.min(MAX_AWAY_MINUTES, Math.round((p.minMinutes + p.maxMinutes) / 2 - 10));
  entry.status = 'temporarily_away'; entry.awayCount += 1; entry.awayUntil = new Date(Date.now() + minutes * 6e4);
  await entry.save();
  await notify(req.user._id, 'Return reminder', `Please return within ${minutes} minutes.`, 'return');
  res.json({ entry, returnBy: entry.awayUntil, estimatedTurnAt: p.estimatedTurnAt });
}));

router.post('/queue/return', protect, wrap(async (req, res) => {
  const entry = await myEntry(req.user._id, ['temporarily_away']);
  if (!entry) return res.status(400).json({ message: 'You are not marked as away.' });
  const late = Date.now() > entry.awayUntil;
  entry.status = 'waiting'; entry.awayUntil = undefined;
  if (late) entry.joinedAt = new Date(); // return policy: late = back of the line
  await entry.save();
  res.json({ entry, movedToBack: late, message: late ? 'You returned late and were moved to the back of the line.' : 'Welcome back, your place is kept.' });
}));

router.post('/queue/cancel', protect, wrap(async (req, res) => {
  const entry = await myEntry(req.user._id);
  if (!entry || entry.status === 'in_consultation') return res.status(400).json({ message: 'Nothing to cancel.' });
  entry.status = 'cancelled'; await entry.save();
  res.json({ message: 'Token cancelled.' });
}));

router.get('/queue/history', protect, wrap(async (req, res) => {
  const rows = await Queue.find({ patientId: req.user._id, status: 'completed' }).sort('-completedAt').limit(20).populate('doctorId departmentId', 'name');
  res.json(rows.map((r) => ({ date: r.completedAt, department: r.departmentId?.name, doctor: r.doctorId?.name, waitMinutes: Math.round(((r.startedAt || r.calledAt) - r.joinedAt) / 6e4) })));
}));

// ---------- Notifications ----------
router.get('/notifications', protect, wrap(async (req, res) => res.json(await Notification.find({ userId: req.user._id }).sort('-createdAt').limit(50))));
router.post('/notifications/read', protect, wrap(async (req, res) => { await Notification.updateMany({ userId: req.user._id }, { read: true }); res.json({ ok: true }); }));

// ---------- Staff / admin ----------
router.get('/admin/queues', ...staff, wrap(async (req, res) => {
  const filter = { status: { $in: ACTIVE } };
  if (req.query.doctorId) filter.doctorId = req.query.doctorId;
  const rows = await Queue.find(filter).populate('patientId', 'name').populate('doctorId', 'name').populate('departmentId', 'name');
  const order = { emergency: 2, senior_or_pregnant: 1, normal: 0 };
  res.json(rows.sort((a, b) => order[b.priority] - order[a.priority] || a.joinedAt - b.joinedAt));
}));

router.post('/admin/queue/call-next', ...staff, validate([body('doctorId').isMongoId().withMessage('A valid doctorId is required.')]), wrap(async (req, res) => {
  const next = (await doctorQueue(req.body.doctorId)).find((q) => q.status === 'waiting'); // away patients are skipped
  if (!next) return res.status(404).json({ message: 'No patients are currently waiting.' });
  next.status = 'called'; next.calledAt = new Date(); await next.save();
  await notify(next.patientId, "It's your turn", `Token ${next.tokenNumber}, please proceed to the doctor.`, 'called');
  await notifyApproaching(req.body.doctorId);
  res.json(next);
}));

async function transition(req, res, from, to, stamp) {
  const q = await Queue.findOne({ _id: req.body.queueId, status: { $in: from } });
  if (!q) return res.status(400).json({ message: `Entry must be ${from.join(' or ')}.` });
  q.status = to; q[stamp] = new Date(); await q.save();
  res.json(q);
}
router.post('/admin/queue/start', ...staff, wrap((req, res) => transition(req, res, ['called'], 'in_consultation', 'startedAt')));
router.post('/admin/queue/complete', ...staff, wrap((req, res) => transition(req, res, ['in_consultation', 'called'], 'completed', 'completedAt')));
router.post('/admin/queue/skip', ...staff, wrap(async (req, res) => {
  const q = await Queue.findByIdAndUpdate(req.body.queueId, { status: 'waiting', joinedAt: new Date() }, { new: true });
  res.json(q); // skipped patients rejoin at the back
}));
router.post('/admin/queue/cancel', ...staff, wrap((req, res) => transition(req, res, ACTIVE, 'cancelled', 'completedAt')));
router.post('/admin/queue/notify', ...staff, wrap(async (req, res) => {
  const q = await Queue.findById(req.body.queueId);
  if (!q) return res.status(404).json({ message: 'Entry not found.' });
  await notify(q.patientId, 'Please return', 'Staff are asking you to return to the waiting area.', 'return');
  res.json({ message: 'Patient notified.' });
}));

router.post('/admin/queue/emergency', ...staff, validate([body('patientId').isMongoId().withMessage('A valid patientId is required.'), body('doctorId').isMongoId().withMessage('A valid doctorId is required.'), body('reason').isString().trim().notEmpty().withMessage('A reason is required.'), body('level').toInt().isInt({ min: 1, max: 3 }).withMessage('Level must be 1, 2 or 3.')]), wrap(async (req, res) => {
  const { patientId, doctorId, reason, level } = req.body;
  if (!reason || ![1, 2, 3].includes(level)) return res.status(400).json({ message: 'Reason and level (1-3) are required.' });
  const doctor = await Doctor.findById(doctorId);
  const dept = await Department.findById(doctor?.department);
  if (!dept) return res.status(400).json({ message: 'Doctor not found.' });
  const entry = await Queue.create({
    tokenNumber: `E-${await nextToken(dept)}`, patientId, doctorId, departmentId: dept._id, priority: 'emergency',
    emergency: { reason, level, authorizedBy: req.user._id, at: new Date() },
  });
  res.status(201).json(entry); // every emergency keeps who authorised it, why, and when
}));

router.post('/admin/doctor/delay', ...staff, wrap(async (req, res) => {
  const d = await Doctor.findByIdAndUpdate(req.body.doctorId, { delayMinutes: Math.max(0, +req.body.minutes || 0) }, { new: true });
  const waiting = await Queue.find({ doctorId: d._id, status: { $in: ['waiting', 'temporarily_away'] } });
  await Promise.all(waiting.map((q) => notify(q.patientId, 'Doctor delay', `${d.name} is delayed by about ${d.delayMinutes} minutes.`, 'delay')));
  res.json(d);
}));

router.get('/admin/dashboard', ...staff, wrap(async (req, res) => {
  const start = new Date().setHours(0, 0, 0, 0);
  const [totalToday, waiting, doctorsAvailable, depts] = await Promise.all([
    Queue.countDocuments({ joinedAt: { $gte: start } }), Queue.countDocuments({ status: 'waiting' }),
    Doctor.countDocuments({ status: { $ne: 'off_duty' } }), Department.find().lean(),
  ]);
  const departments = await Promise.all(depts.map(async (d) => {
    const w = await Queue.countDocuments({ departmentId: d._id, status: { $in: ACTIVE } });
    const docs = Math.max(1, await Doctor.countDocuments({ department: d._id, status: { $ne: 'off_duty' } }));
    const avgWait = Math.round((w / docs) * 10);
    return { name: d.name, waiting: w, avgWait, status: avgWait > 40 ? 'busy' : avgWait > 25 ? 'moderate' : 'normal' };
  }));
  res.json({ totalToday, waiting, doctorsAvailable, departments });
}));

router.get('/analytics', ...staff, wrap(async (req, res) => {
  const done = await Queue.find({ status: 'completed', joinedAt: { $gte: new Date(Date.now() - 7 * 864e5) } });
  const waits = done.map((d) => ((d.startedAt || d.calledAt || d.completedAt) - d.joinedAt) / 6e4).filter((w) => w >= 0);
  const durations = done.filter((d) => d.startedAt).map((d) => (d.completedAt - d.startedAt) / 6e4);
  const avg = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0);
  const perHour = Array.from({ length: 24 }, (_, h) => {
    const hr = done.filter((d) => d.joinedAt.getHours() === h);
    return { hour: h, patients: hr.length, avgWait: avg(hr.map((d) => ((d.startedAt || d.calledAt) - d.joinedAt) / 6e4)) };
  });
  const cancelled = await Queue.countDocuments({ status: 'cancelled' });
  res.json({
    averageWait: avg(waits), maxWait: Math.round(Math.max(0, ...waits)), averageConsultation: avg(durations),
    patientsServed: done.length, noShowRate: done.length + cancelled ? +(cancelled / (done.length + cancelled)).toFixed(2) : 0, perHour,
  });
}));

router.get('/admin/patients', ...staff, wrap(async (req, res) => res.json(await User.find({ role: 'patient' }).select('name email phone createdAt').limit(200))));

// ---------- Admin management (admin role only for changes) ----------
const admin = [protect, allow('admin')];
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

router.get('/admin/departments', ...staff, wrap(async (req, res) => res.json(await Department.find().sort('name'))));
router.post('/admin/departments', ...admin, validate([body('name').isString().trim().notEmpty().withMessage('Name is required.'), body('code').isString().isLength({ min: 2, max: 4 }).withMessage('Code must be 2-4 letters.')]), wrap(async (req, res) => {
  const { name, description } = req.body;
  const code = (req.body.code || '').toUpperCase();
  if (!name || !/^[A-Z]{2,4}$/.test(code)) return res.status(400).json({ message: 'Name and a 2-4 letter code are required.' });
  if (await Department.exists({ $or: [{ name }, { code }] })) return res.status(409).json({ message: 'Name or code already exists.' });
  res.status(201).json(await Department.create({ name, code, description }));
}));
router.put('/admin/departments/:id', ...admin, wrap(async (req, res) =>
  res.json(await Department.findByIdAndUpdate(req.params.id, pick(req.body, ['status', 'description']), { new: true }))));

router.post('/admin/doctors', ...admin, validate([body('name').isString().trim().notEmpty().withMessage('Name is required.'), body('department').isMongoId().withMessage('A valid department is required.')]), wrap(async (req, res) => {
  const { name, department } = req.body;
  if (!name || !department) return res.status(400).json({ message: 'Name and department are required.' });
  res.status(201).json(await Doctor.create(pick(req.body, ['name', 'specialization', 'department', 'averageConsultationTime'])));
}));
router.put('/admin/doctors/:id', ...admin, wrap(async (req, res) =>
  res.json(await Doctor.findByIdAndUpdate(req.params.id, pick(req.body, ['status', 'averageConsultationTime', 'specialization']), { new: true }))));

router.get('/admin/appointments', ...staff, wrap(async (req, res) =>
  res.json(await Appointment.find().sort('scheduledFor').limit(100).populate('patientId', 'name').populate('doctorId', 'name'))));
router.post('/admin/appointments', ...staff, validate([body('patientId').isMongoId().withMessage('A valid patientId is required.'), body('doctorId').isMongoId().withMessage('A valid doctorId is required.'), body('scheduledFor').isISO8601().withMessage('A valid date and time is required.')]), wrap(async (req, res) => {
  const { patientId, doctorId, scheduledFor } = req.body;
  if (!patientId || !doctorId || !scheduledFor) return res.status(400).json({ message: 'Patient, doctor and time are required.' });
  const a = await Appointment.create({ patientId, doctorId, scheduledFor });
  await notify(patientId, 'Appointment booked', `Your appointment is on ${new Date(scheduledFor).toLocaleString()}.`);
  res.status(201).json(a);
}));
router.put('/admin/appointments/:id', ...staff, wrap(async (req, res) => {
  const a = await Appointment.findById(req.params.id);
  if (!a) return res.status(404).json({ message: 'Appointment not found.' });
  a.status = req.body.status; await a.save();
  if (a.status === 'checked_in' && !(await Queue.exists({ patientId: a.patientId, status: { $in: ACTIVE } }))) {
    const doctor = await Doctor.findById(a.doctorId);
    const dept = await Department.findById(doctor.department);
    const entry = await Queue.create({ tokenNumber: await nextToken(dept), patientId: a.patientId, doctorId: a.doctorId, departmentId: dept._id });
    await notify(a.patientId, 'Checked in', `Your token is ${entry.tokenNumber}.`);
  }
  res.json(a);
}));

module.exports = router;
