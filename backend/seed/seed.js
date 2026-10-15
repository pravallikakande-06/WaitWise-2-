// DEMO DATA ONLY. Never run against a production database.
require('dotenv').config({ path: '../.env' });
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { User, Department, Doctor, Queue } = require('../models');

const DEPTS = [['General Medicine', 'GEN'], ['Cardiology', 'CAR'], ['Orthopedics', 'ORT'], ['Pediatrics', 'PED'], ['Dermatology', 'DER'], ['Neurology', 'NEU'], ['ENT', 'ENT'], ['Gynecology', 'GYN']];
const DOCTORS = ['Priya', 'Rao', 'Kumar', 'Iyer', 'Shah', 'Nair', 'Khan', 'Reddy', 'Das', 'Mehta'];

(async () => {
  const { SEED_ADMIN_PASSWORD: adminPw, SEED_PATIENT_PASSWORD: patientPw } = process.env;
  if (!adminPw || !patientPw) throw new Error('Set SEED_ADMIN_PASSWORD and SEED_PATIENT_PASSWORD in .env');
  await mongoose.connect(process.env.MONGO_URI);
  await Promise.all([User, Department, Doctor, Queue].map((m) => m.deleteMany({})));

  const depts = await Department.insertMany(DEPTS.map(([name, code]) => ({ name, code, description: `${name} outpatient care` })));
  const doctors = await Doctor.insertMany(DOCTORS.map((n, i) => ({
    name: `Dr. ${n}`, specialization: depts[i % 8].name, department: depts[i % 8]._id, averageConsultationTime: 6 + (i % 5) * 2,
  })));
  await User.create({ name: 'Admin', email: 'admin@waitwise.demo', role: 'admin', password: await bcrypt.hash(adminPw, 12) });
  await User.create({ name: 'Front Desk', email: 'staff@waitwise.demo', role: 'staff', password: await bcrypt.hash(adminPw, 12) });
  await User.create({ name: 'Dr. Priya', email: 'doctor@waitwise.demo', role: 'doctor', doctorId: doctors[0]._id, password: await bcrypt.hash(adminPw, 12) });
  const hash = await bcrypt.hash(patientPw, 12);
  const patients = await User.insertMany(Array.from({ length: 35 }, (_, i) => ({
    name: i === 0 ? 'Demo Patient' : `Patient ${i}`, email: i === 0 ? 'patient@waitwise.demo' : `patient${i}@waitwise.demo`, password: hash,
  })));

  // 40 completed visits across the last 7 days (feeds analytics + prediction history), then 15 live entries.
  const rows = [];
  for (let i = 0; i < 40; i++) {
    const d = doctors[i % 10], joined = new Date(Date.now() - (1 + (i % 7)) * 864e5 + (i % 9) * 36e5);
    const started = new Date(+joined + (10 + (i * 7) % 40) * 6e4);
    rows.push({ tokenNumber: `H-${i}`, patientId: patients[1 + (i % 34)]._id, doctorId: d._id, departmentId: d.department, status: 'completed', joinedAt: joined, startedAt: started, calledAt: started, completedAt: new Date(+started + d.averageConsultationTime * 6e4) });
  }
  for (let i = 0; i < 15; i++) {
    const d = doctors[i % 3];
    rows.push({ tokenNumber: `${depts[i % 3].code}-${String(i + 1).padStart(3, '0')}`, patientId: patients[1 + i]._id, doctorId: d._id, departmentId: d.department, joinedAt: new Date(Date.now() - (30 - i) * 6e4) });
  }
  await Queue.insertMany(rows);
  console.log('Seeded demo data. Logins: admin@waitwise.demo, staff@waitwise.demo, doctor@waitwise.demo, patient@waitwise.demo');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
