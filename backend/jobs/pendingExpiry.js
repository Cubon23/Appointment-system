const cron = require('node-cron');
const Appointment = require('../models/Appointment');
const { notify, resolveStudentId, fmtDate, fmtTime } = require('../utils/notify');
const { isExpired, EXPIRY_REASON } = require('../utils/pendingExpiry');

// Today's / tomorrow's date as the Philippines would call it (see consultationReminder.js for why).
const phDateString = (offsetDays = 0) => new Date(Date.now() + 8 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);

// Every minute: a request still PENDING when its start time arrives is rejected automatically,
// and the student is told (in-app + email, via notify()). Panelist rule 2.2.
const startPendingExpiry = () => {
  console.log('Pending Request Expiry Job Initialized');

  cron.schedule('* * * * *', async () => {
    try {
      const now = Date.now();
      // Everything dated up to tomorrow: also catches requests that expired while the server was off.
      const candidates = await Appointment.find({ status: 'PENDING', date: { $lte: phDateString(1) } }).populate('facultyId', 'name');
      for (const apt of candidates) {
        if (!isExpired(apt, now)) continue;
        // Compare-and-set: if the faculty answered a moment ago, this finds nothing and changes nothing.
        const updated = await Appointment.findOneAndUpdate(
          { _id: apt._id, status: 'PENDING' },
          { $set: { status: 'REJECTED', autoRejected: true, cancelReason: EXPIRY_REASON } },
          { new: true }
        );
        if (!updated) continue;
        await notify(await resolveStudentId(updated), {
          type: 'APPOINTMENT_UPDATE',
          title: 'Consultation request expired',
          message: `Your request with ${apt.facultyId ? apt.facultyId.name : 'your instructor'} on ${fmtDate(updated.date)} at ${fmtTime(updated.time)} was automatically declined because it was not answered before the requested time. Please choose another slot.`,
        });
      }
    } catch (error) {
      console.error('Error in Pending Expiry Job:', error);
    }
  });
};

module.exports = startPendingExpiry;
