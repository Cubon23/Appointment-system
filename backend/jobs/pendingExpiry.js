const cron = require('node-cron');
const Appointment = require('../models/Appointment');
const { notify, resolveStudentId, fmtDate, fmtTime } = require('../utils/notify');
const { manilaNow } = require('../utils/manilaTime');
const { isPendingExpired } = require('../utils/appointmentTime');

const REASON = 'No response from the faculty member before the requested time.';

// Every minute: a request still PENDING when its start time is reached is rejected automatically,
// and the student is told (in-app message plus email; APPOINTMENT_UPDATE is an emailed type).
// Safe to run twice and to catch up after downtime: the update only touches rows that are still PENDING.
async function expirePendingRequests(nowMs = Date.now()) {
  const candidates = await Appointment.find({ status: 'PENDING', date: { $lte: manilaNow().dateStr } });
  let expired = 0;
  for (const apt of candidates) {
    if (!isPendingExpired(apt, nowMs)) continue;
    const updated = await Appointment.findOneAndUpdate(
      { _id: apt._id, status: 'PENDING' }, // the faculty member may have answered a moment ago
      { status: 'REJECTED', cancelReason: REASON, autoRejected: true },
      { new: true }
    );
    if (!updated) continue;
    expired += 1;
    await notify(await resolveStudentId(updated), {
      type: 'APPOINTMENT_UPDATE',
      title: 'Consultation request expired',
      message: `Your request for ${fmtDate(updated.date)} at ${fmtTime(updated.time)} was automatically rejected because the faculty member did not respond before the requested time. Please choose another slot.`,
      appointmentId: updated._id,
    });
  }
  return expired;
}

const startPendingExpiry = () => {
  console.log('Pending Request Expiry Job Initialized');
  cron.schedule('* * * * *', async () => {
    try { await expirePendingRequests(); } catch (error) { console.error('Pending expiry job failed:', error.message); }
  });
};

module.exports = startPendingExpiry;
module.exports.expirePendingRequests = expirePendingRequests;
