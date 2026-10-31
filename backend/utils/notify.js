const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendNotificationEmail } = require('./mailer');

// Every notification is also emailed to the person's school address (panelist rule 5.1), Dean broadcasts
// included. Gmail allows about 500 messages a day from a personal sender, which is plenty for a small
// user base. Set EMAIL_NOTIFICATIONS=off to disable emailing (for example in local tests).

// Fire-and-forget: a slow or failing mailbox must never delay or break the action that triggered it.
function emailCopies(ids, payload) {
  if (process.env.EMAIL_NOTIFICATIONS === 'off') return;
  User.find({ _id: { $in: ids }, accountStatus: 'ACTIVE' }).select('email').lean()
    .then(async (users) => {
      // One at a time, so a broadcast does not hit Gmail with a burst of simultaneous messages.
      for (const u of users.filter(x => x.email)) {
        await sendNotificationEmail(u.email, payload).catch(err => console.error('Notification email failed:', err.message));
      }
    })
    .catch(err => console.error('Notification email lookup failed:', err.message));
}

// Create a notification for one or many users. Never throws:
// a failed notification must never break the action that triggered it.
async function notify(userIds, { type, title, message }) {
  try {
    const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean).map(String))];
    if (!ids.length) return;
    await Notification.insertMany(ids.map(userId => ({ userId, type, title, message })));
    emailCopies(ids, { type, title, message });
  } catch (err) {
    console.error('notify() failed:', err.message);
  }
}

// Notify every active user with a given role (e.g. all ADMINs)
async function notifyRole(role, payload) {
  try {
    const users = await User.find({ role, accountStatus: 'ACTIVE' }).select('_id');
    await notify(users.map(u => u._id), payload);
  } catch (err) {
    console.error('notifyRole() failed:', err.message);
  }
}

// Older appointments have no studentId, so fall back to matching the student by name
async function resolveStudentId(apt) {
  if (apt.studentId) return apt.studentId;
  const u = await User.findOne({ role: 'STUDENT', name: apt.studentName }).select('_id');
  return u ? u._id : null;
}

const fmtDate = (d) =>
  new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

const fmtTime = (t) => {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

module.exports = { notify, notifyRole, resolveStudentId, fmtDate, fmtTime };
