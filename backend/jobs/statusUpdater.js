const cron = require('node-cron');
const User = require('../models/User');
const Schedule = require('../models/Schedule');

// This system's school, faculty, and class schedules are all Philippine (UTC+8), but this
// job previously read now.getHours()/getDay() directly off the server's own clock. That's
// only correct if the server process itself happens to be configured for Philippine time —
// on a server running in UTC (the common default for most hosts) every comparison here
// would be 8 hours off from the real Philippine clock. Shifting the UTC instant by +8h and
// reading it back with the UTC getters gives the correct Philippine wall-clock reading no
// matter what timezone the server process is actually running in — the same fix applied to
// jobs/consultationReminder.js.
function phNow() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000);
}

const startStatusUpdater = () => {
  console.log('Automated Status & Schedule Updater Initialized');

  // Run every 5 minutes (a good balance between real-time and server load)
  cron.schedule('*/5 * * * *', async () => {
    try {
      const ph = phNow();
      const currentDay = ph.getUTCDay(); // 0 = Sunday, 1 = Monday, ... — Philippine-local day,
                                          // same convention Schedule.dayOfWeek already uses
                                          // elsewhere in this app (booked via aptDate.getDay()).
      const currentHour = ph.getUTCHours();

      const currentHoursStr = currentHour.toString().padStart(2, '0');
      const currentMinutesStr = ph.getUTCMinutes().toString().padStart(2, '0');
      const currentTime = `${currentHoursStr}:${currentMinutesStr}`; // 'HH:MM', Philippine local

      // 1. OFF-HOURS & LUNCH SWEEP (11 AM - 1 PM) OR (8 PM - 6 AM), Philippine time
      if ((currentHour >= 20 || currentHour < 6) || (currentHour >= 11 && currentHour < 13)) {
        await User.updateMany(
          { role: 'FACULTY' },
          { $set: { currentStatus: 'OUT_OF_OFFICE', currentLocation: '', statusNote: 'System Auto-Reset (Off-hours/Lunch)' } }
        );
        return; // Stop here during off-hours
      }

      // 2. WORKING HOURS - SMART SWEEP
      const faculties = await User.find({ role: 'FACULTY' });

      for (let faculty of faculties) {
        // Did they scan in today? Compare against "today" in Philippine time, not the
        // server's own calendar date — near midnight PH these can disagree.
        const lastUpdate = faculty.statusUpdatedAt ? new Date(faculty.statusUpdatedAt.getTime() + 8 * 60 * 60 * 1000) : null;
        const updatedToday = lastUpdate &&
                             lastUpdate.getUTCDate() === ph.getUTCDate() &&
                             lastUpdate.getUTCMonth() === ph.getUTCMonth() &&
                             lastUpdate.getUTCFullYear() === ph.getUTCFullYear();

        // Check their actual teaching schedule for today
        const todaysClasses = await Schedule.find({ facultyId: faculty._id, dayOfWeek: currentDay });
        const hasClassToday = todaysClasses.length > 0;

        // SCENARIO A: THEY ARE ABSENT (No QR Scan)
        if (!updatedToday) {
          if (hasClassToday) {
            faculty.currentStatus = 'ABSENT';
            faculty.statusNote = 'Auto-flagged: Missed scheduled class day';
          } else {
            faculty.currentStatus = 'OUT_OF_OFFICE';
            faculty.statusNote = 'Auto-flagged: No classes scheduled today';
          }
          faculty.currentLocation = '';
          await faculty.save();
          continue;
        }

        // SCENARIO B: THEY ARE PRESENT (QR Scanned Today)
        // 'HH:MM' strings compare correctly lexicographically, same as the rest of the app
        // (see isOverlapping()/timeMath.js), as long as both sides are zero-padded.
        const activeClass = todaysClasses.find(cls => cls.startTime <= currentTime && cls.endTime > currentTime);

        // Don't overwrite if they manually set themselves to ON_LEAVE, ON_BREAK, or IN_MEETING
        const isManuallyBusy = ['ON_LEAVE', 'ON_BREAK', 'IN_MEETING'].includes(faculty.currentStatus);

        if (!isManuallyBusy) {
          if (activeClass) {
            faculty.currentStatus = 'IN_CLASS';
            faculty.currentLocation = activeClass.room;
          } else {
            faculty.currentStatus = 'AVAILABLE';
            faculty.currentLocation = 'Faculty Office'; // Default fallback
          }
          await faculty.save();
        }
      }
    } catch (error) {
      console.error('Error in Status Updater Cron Job:', error);
    }
  });
};

module.exports = startStatusUpdater;
