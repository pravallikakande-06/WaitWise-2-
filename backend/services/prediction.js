const { Queue, Doctor } = require('../models');

const RANK = { emergency: 2, senior_or_pregnant: 1, normal: 0 };
const ACTIVE = ['waiting', 'called', 'in_consultation', 'temporarily_away'];

// Queue order: emergency first, then priority, then arrival time.
const sortQueue = (entries) =>
  [...entries].sort((a, b) => RANK[b.priority] - RANK[a.priority] || a.joinedAt - b.joinedAt);

const doctorQueue = async (doctorId) => sortQueue(await Queue.find({ doctorId, status: { $in: ACTIVE } }));

// Average from the last 7 days of real consultations; falls back to the doctor's default.
async function consultationStats(doctor) {
  const since = new Date(Date.now() - 7 * 864e5);
  const done = await Queue.find({ doctorId: doctor._id, status: 'completed', startedAt: { $gte: since } }).select('startedAt completedAt');
  const mins = done.map((d) => (d.completedAt - d.startedAt) / 6e4).filter((m) => m > 0 && m < 120);
  const avg = mins.length >= 5 ? mins.reduce((s, m) => s + m, 0) / mins.length : doctor.averageConsultationTime;
  return { avg, samples: mins.length };
}

/*
 * Wait = patientsAhead * avgConsultation * typeFactor + remaining current consult + doctor delay + emergency delay.
 * Returned as a range with a confidence label. It is an estimate, not a medical guarantee.
 */
async function predictWait(entry) {
  const doctor = await Doctor.findById(entry.doctorId);
  const queue = await doctorQueue(entry.doctorId);
  const idx = queue.findIndex((q) => String(q._id) === String(entry._id));
  const ahead = queue.slice(0, idx < 0 ? queue.length : idx);
  const { avg, samples } = await consultationStats(doctor);
  const typeFactor = { consultation: 1, follow_up: 0.7, report_review: 0.6 }[entry.appointmentType] || 1;
  const currentConsult = ahead.some((q) => q.status === 'in_consultation') ? avg * 0.5 : 0;
  const recentEmergencies = await Queue.countDocuments({ doctorId: doctor._id, priority: 'emergency', joinedAt: { $gte: new Date(Date.now() - 36e5) } });
  const base = ahead.length * avg * typeFactor + currentConsult + doctor.delayMinutes + recentEmergencies * 3;
  const spread = samples >= 20 ? 0.1 : samples >= 5 ? 0.2 : 0.35;
  const min = Math.max(0, Math.round(base * (1 - spread)));
  const max = Math.round(base * (1 + spread)) + (ahead.length ? 2 : 0);
  return {
    patientsAhead: ahead.length, position: idx + 1, minMinutes: min, maxMinutes: max,
    estimatedTurnAt: new Date(Date.now() + ((min + max) / 2) * 6e4),
    confidence: samples >= 20 && doctor.delayMinutes < 15 ? 'high' : samples >= 5 ? 'moderate' : 'low',
    note: 'Prediction is based on current queue activity and historical consultation times.',
  };
}

module.exports = { predictWait, doctorQueue, ACTIVE };
