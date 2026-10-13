const cron = require('node-cron');
const User              = require('../models/User');
const Schedule          = require('../models/Schedule');
const ConsultationHours = require('../models/ConsultationHours');

// ─────────────────────────────────────────────────────────────────────────────
// Philippine timezone fix (kept from existing codebase):
// Most hosts run in UTC. Reading getHours()/getDay() directly is 8 h off.
// Shifting by +8 h and reading UTC getters gives the correct PH wall-clock
// reading regardless of the server's own timezone setting.
// ─────────────────────────────────────────────────────────────────────────────
function phNow() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGIC OVERVIEW
//
// Every minute the job checks each faculty member's situation:
//
//  1. OFF-HOURS (before 6 AM or after 8 PM) or LUNCH (11 AM–1 PM):
//     → All faculty auto-set to OUT_OF_OFFICE unless isManualOverride is true
//       (faculty on approved leave shouldn't be overridden).
//
//  2. WORKING HOURS — per-faculty:
//     a. Did they update their status today? (statusUpdatedAt set today PH time)
//        NO  + has class today  → ABSENT (auto-flagged)
//        NO  + no class today   → OUT_OF_OFFICE
//
//     b. YES — they are "present". Now check for active blocks:
//        • isManualOverride TRUE  and the override belongs to the CURRENT block
//          (statusUpdatedAt >= current block startTime today)
//          → SKIP — respect the faculty's choice for this block
//        • Otherwise → auto-set based on schedule:
//          - Inside a class block       → IN_CLASS
//          - Inside a consultation block→ IN_CONSULTATION
//          - Neither                    → AVAILABLE
// ─────────────────────────────────────────────────────────────────────────────

/** "HH:MM" string → minutes from midnight */
const toMinutes = (t) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** Find the first block from an array that contains nowMinutes */
const findActiveBlock = (blocks, nowMinutes) =>
  blocks.find(b => toMinutes(b.startTime) <= nowMinutes && nowMinutes < toMinutes(b.endTime)) || null;

/** Build a PH-local Date for today at the given "HH:MM" */
const phTodayAt = (timeStr, ph) => {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date(ph);          // clone the PH-shifted instant
  d.setUTCHours(h, m, 0, 0);      // set the HH:MM in UTC getters (== PH wall clock)
  return d;
};

const startStatusUpdater = () => {
  console.log('[StatusUpdater] Initialized — running every minute (PH timezone-aware).');

  cron.schedule('* * * * *', async () => {
    try {
      const ph           = phNow();
      const currentHour  = ph.getUTCHours();
      const currentDay   = ph.getUTCDay();   // 0=Sun … 6=Sat, matches Schedule.dayOfWeek
      const nowMinutes   = currentHour * 60 + ph.getUTCMinutes();
      const hhMM         = `${String(currentHour).padStart(2,'0')}:${String(ph.getUTCMinutes()).padStart(2,'0')}`;

      // ── 1. OFF-HOURS & LUNCH sweep ────────────────────────────────────────
      const isOffHours = currentHour < 6 || currentHour >= 20;
      const isLunch    = currentHour >= 11 && currentHour < 13;

      if (isOffHours || isLunch) {
        // Only reset faculty who have NOT manually chosen a status
        await User.updateMany(
          { role: 'FACULTY', isManualOverride: false },
          {
            $set: {
              currentStatus:   'OUT_OF_OFFICE',
              currentLocation: '',
              statusNote:      isLunch ? 'Auto-Reset: Lunch break' : 'Auto-Reset: Off-hours',
              isManualOverride: false,
            },
          }
        );
        return;
      }

      // ── 2. WORKING HOURS — per-faculty smart sweep ───────────────────────
      const allFaculty = await User.find({ role: 'FACULTY' }).lean(false);

      for (const faculty of allFaculty) {
        // ON_LEAVE is a human decision — always respect it
        if (faculty.currentStatus === 'ON_LEAVE') continue;

        // "Updated today?" check — uses PH-local date comparison
        const lastUpdate    = faculty.statusUpdatedAt
          ? new Date(faculty.statusUpdatedAt.getTime() + 8 * 60 * 60 * 1000)
          : null;
        const updatedToday  = lastUpdate &&
          lastUpdate.getUTCDate()     === ph.getUTCDate()   &&
          lastUpdate.getUTCMonth()    === ph.getUTCMonth()  &&
          lastUpdate.getUTCFullYear() === ph.getUTCFullYear();

        // Fetch today's scheduled blocks for this faculty
        const [classBlocks, consultBlocks] = await Promise.all([
          Schedule.find({ facultyId: faculty._id, dayOfWeek: currentDay }).lean(),
          ConsultationHours.find({ facultyId: faculty._id, dayOfWeek: currentDay }).lean(),
        ]);

        const hasClassToday = classBlocks.length > 0;

        // ── SCENARIO A: Not updated today — treat as absent ──────────────
        if (!updatedToday) {
          const newStatus = hasClassToday ? 'ABSENT' : 'OUT_OF_OFFICE';
          const newNote   = hasClassToday
            ? 'Auto-flagged: missed scheduled class day'
            : 'Auto-flagged: no classes scheduled today';

          if (faculty.currentStatus !== newStatus) {
            faculty.currentStatus    = newStatus;
            faculty.currentLocation  = '';
            faculty.statusNote       = newNote;
            faculty.isManualOverride = false;
            await faculty.save();
          }
          continue;
        }

        // ── SCENARIO B: Updated today — check for active blocks ──────────
        const activeClass   = findActiveBlock(classBlocks,   nowMinutes);
        const activeConsult = findActiveBlock(consultBlocks, nowMinutes);
        const activeBlock   = activeClass || activeConsult;

        // Manual override logic:
        // Respect the override only if it was set AFTER the current block started.
        // When a NEW block begins (blockStart > statusUpdatedAt), auto resumes.
        if (faculty.isManualOverride && activeBlock) {
          const blockStart    = phTodayAt(activeBlock.startTime, ph);
          const overrideSetAt = new Date(
            faculty.statusUpdatedAt.getTime() + 8 * 60 * 60 * 1000
          );
          if (overrideSetAt >= blockStart) {
            // Faculty set their status during this block → respect it
            continue;
          }
          // Their override predates this block → auto takes back control below
        } else if (faculty.isManualOverride && !activeBlock) {
          // Free period — always respect manual status
          continue;
        }

        // Auto-set based on active block
        let newStatus   = 'AVAILABLE';
        let newLocation = faculty.room || '';

        if (activeClass) {
          newStatus   = 'IN_CLASS';
          newLocation = activeClass.room || faculty.room || '';
        } else if (activeConsult) {
          newStatus   = 'IN_CONSULTATION';
          newLocation = faculty.room || '';
        }

        if (faculty.currentStatus !== newStatus || faculty.isManualOverride) {
          faculty.currentStatus    = newStatus;
          faculty.currentLocation  = newLocation;
          faculty.isManualOverride = false;
          // Do NOT touch statusUpdatedAt — it tracks human updates only
          await faculty.save();
        }
      }
    } catch (err) {
      console.error('[StatusUpdater] Error:', err.message);
    }
  });
};

module.exports = startStatusUpdater;
