const cron = require('node-cron');
const User = require('../models/User');
// const Schedule = require('../models/Schedule');

const startStatusUpdater = () => {
  console.log('Automated Status & Schedule Updater Initialized');

  // Run every 5 minutes (a good balance between real-time and server load)
  cron.schedule('*/5 * * * *', async () => {
    try {
      const now = new Date();
      const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const currentHour = now.getHours();
      
      const currentHoursStr = now.getHours().toString().padStart(2, '0');
      const currentMinutesStr = now.getMinutes().toString().padStart(2, '0');
      const currentTime = `${currentHoursStr}:${currentMinutesStr}`;

      // 1. OFF-HOURS & LUNCH SWEEP (11 AM - 1 PM) OR (8 PM - 6 AM)
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
        // Did they scan in today?
        const lastUpdate = faculty.statusUpdatedAt ? new Date(faculty.statusUpdatedAt) : null;
        const updatedToday = lastUpdate && 
                             lastUpdate.getDate() === now.getDate() &&
                             lastUpdate.getMonth() === now.getMonth() &&
                             lastUpdate.getFullYear() === now.getFullYear();

        // Check their schedule for today
        // const todaysClasses = await Schedule.find({ facultyId: faculty._id, dayOfWeek: currentDay });
        const hasClassToday = false; // Placeholder - replace with actual schedule check if needed

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
        // Now we safely apply your "In Class" vs "Available" logic!
        // const activeClass = todaysClasses.find(cls => cls.startTime <= currentTime && cls.endTime > currentTime);
        const activeClass = null; // Placeholder - replace with actual class check if needed

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