const cron = require('node-cron');
const Appointment = require('../models/Appointment');
const { notify, fmtTime } = require('../utils/notify');

// All appointment date/time strings in this system ('YYYY-MM-DD' / 'HH:MM') are entered,
// shown, and meant to be read as Philippine local time (UTC+8) — the school is in the
// Philippines and nothing in the booking form ever asks for a timezone. A naive combine
// like `${date}T${time}:00Z` treats that local wall-clock reading as if it were UTC; on a
// server actually running in UTC (the normal case for most hosts, including most free-tier
// deploys) that silently pushes every reminder 8 hours off from the real appointment time.
// Appending '+08:00' instead tells JS "this clock reading is Philippine time," so the
// resulting Date is the correct real-world instant regardless of what timezone the server
// process itself runs in.
function phMoment(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr}:00+08:00`);
}

// Today's / tomorrow's / yesterday's date as the Philippines would call it right now — not
// the server's own local date, and not UTC's date. Used only to narrow the Mongo query
// before the precise phMoment() check below; a one-day window on each side keeps this safe
// across the UTC/PH day-boundary gap no matter which direction the server's clock is off.
function phDateString(offsetDays = 0) {
  const phMs = Date.now() + 8 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000;
  return new Date(phMs).toISOString().slice(0, 10);
}

const startConsultationReminder = () => {
  console.log('Consultation Reminder Job Initialized');

  // Run every 5 minutes, same cadence as the status updater.
  cron.schedule('*/5 * * * *', async () => {
    try {
      const now = new Date(); // a real instant — correct to compare against regardless of server TZ
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

      // Only APPROVED, upcoming, not-yet-reminded appointments are candidates. date/time
      // are strings, so we can't query the combined real-world moment directly in Mongo —
      // narrow by date first, then filter precisely in JS with phMoment().
      const candidates = await Appointment.find({
        status: 'APPROVED',
        reminderSent: false,
        date: { $in: [phDateString(-1), phDateString(0), phDateString(1)] },
      }).populate('facultyId', '_id name');

      for (const apt of candidates) {
        const aptMoment = phMoment(apt.date, apt.time);
        if (aptMoment > now && aptMoment <= oneHourFromNow) {
          if (!apt.facultyId) continue; // orphaned record safety check

          await notify(apt.facultyId._id, {
            type: 'CONSULTATION_UPCOMING',
            title: 'Upcoming consultation in 1 hour',
            message: `${apt.studentName} (${apt.studentSection}) — ${fmtTime(apt.time)} today. Reason: ${apt.reason}`,
          });

          apt.reminderSent = true;
          await apt.save();
        }
      }
    } catch (error) {
      console.error('Error in Consultation Reminder Job:', error);
    }
  });
};

module.exports = startConsultationReminder;
