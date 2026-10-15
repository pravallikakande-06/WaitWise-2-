const { Notification, User } = require('../models');
const { doctorQueue } = require('./prediction');
const realtime = require('./realtime');

// Respects the patient's notification preferences ("called" alerts are always delivered).
async function notify(userId, title, message, type = 'update') {
  const user = await User.findById(userId).select('notificationPrefs');
  if (type !== 'called' && user?.notificationPrefs?.[type] === false) return null;
  const n = await Notification.create({ userId, title, message, type });
  realtime.toUser(userId, 'notification', { title, message, type });
  return n;
}

// Alert the patient who is now 5th in line, once per visit.
async function notifyApproaching(doctorId) {
  const target = (await doctorQueue(doctorId)).filter((q) => ['waiting', 'temporarily_away'].includes(q.status))[4];
  if (!target) return;
  const sent = await Notification.exists({ userId: target.patientId, type: 'approaching', createdAt: { $gte: target.joinedAt } });
  if (!sent) await notify(target.patientId, 'Your turn is approaching', 'Only 5 patients are ahead of you.', 'approaching');
}

module.exports = { notify, notifyApproaching };
