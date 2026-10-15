const { Schema, model } = require('mongoose');
const ref = (name) => ({ type: Schema.Types.ObjectId, ref: name });
const created = { timestamps: { createdAt: true, updatedAt: false } };

const User = model('User', new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, select: false },
  phone: String, dob: Date, emergencyContact: String,
  // "Your turn" (called) alerts are always on; the rest can be switched off.
  notificationPrefs: {
    approaching: { type: Boolean, default: true }, delay: { type: Boolean, default: true },
    return: { type: Boolean, default: true }, update: { type: Boolean, default: true },
  },
  role: { type: String, enum: ['patient', 'doctor', 'staff', 'admin'], default: 'patient' },
  doctorId: ref('Doctor'),
}, created));

const Department = model('Department', new Schema({
  name: { type: String, required: true, unique: true },
  code: { type: String, required: true, unique: true },
  description: String,
  status: { type: String, enum: ['active', 'closed'], default: 'active' },
}));

const Doctor = model('Doctor', new Schema({
  name: { type: String, required: true },
  specialization: String,
  department: { ...ref('Department'), required: true },
  averageConsultationTime: { type: Number, default: 10 },
  status: { type: String, enum: ['available', 'busy', 'off_duty'], default: 'available' },
  delayMinutes: { type: Number, default: 0 },
}));

const Queue = model('Queue', new Schema({
  tokenNumber: { type: String, required: true },
  patientId: { ...ref('User'), required: true },
  doctorId: { ...ref('Doctor'), required: true },
  departmentId: { ...ref('Department'), required: true },
  appointmentType: { type: String, enum: ['consultation', 'follow_up', 'report_review'], default: 'consultation' },
  status: { type: String, enum: ['waiting', 'called', 'in_consultation', 'completed', 'cancelled', 'temporarily_away'], default: 'waiting', index: true },
  priority: { type: String, enum: ['normal', 'senior_or_pregnant', 'emergency'], default: 'normal' },
  emergency: { reason: String, level: { type: Number, min: 1, max: 3 }, authorizedBy: ref('User'), at: Date },
  joinedAt: { type: Date, default: Date.now },
  calledAt: Date, startedAt: Date, completedAt: Date,
  awayUntil: Date, awayCount: { type: Number, default: 0 },
  estimatedWait: Number,
}));

const Notification = model('Notification', new Schema({
  userId: { ...ref('User'), required: true, index: true },
  title: String, message: String,
  type: { type: String, enum: ['approaching', 'update', 'delay', 'return', 'called'], default: 'update' },
  read: { type: Boolean, default: false },
}, created));

const Appointment = model('Appointment', new Schema({
  patientId: { ...ref('User'), required: true },
  doctorId: { ...ref('Doctor'), required: true },
  scheduledFor: { type: Date, required: true },
  status: { type: String, enum: ['scheduled', 'checked_in', 'completed', 'cancelled', 'no_show'], default: 'scheduled' },
}));

module.exports = { User, Department, Doctor, Queue, Notification, Appointment };
