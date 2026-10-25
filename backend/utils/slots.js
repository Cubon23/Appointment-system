// Pure slot logic (no database) so it can be unit-tested.
// A "slot" is one bookable piece of a consultation-hours block: 1 hour, or the shorter
// remainder when a block isn't a whole number of hours (e.g. 9:30-11:00 -> 9:30-10:30, 10:30-11:00).

const { timeToMinutes } = require('./timeMath');

const MAX_PENDING_PER_SLOT = 3;
const OPERATING_START = 450; // 7:30 AM: same limits the booking form always had
const OPERATING_LAST_START = 960; // 4:00 PM

const pad = (n) => String(n).padStart(2, '0');
const toHHMM = (mins) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

// Day of week (0=Sun) for a "YYYY-MM-DD" date, independent of server timezone.
const dayOfWeekOf = (dateStr) => new Date(`${dateStr}T00:00:00Z`).getUTCDay();

// Add n days to a "YYYY-MM-DD" date string.
const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Split "09:00"-"11:00" into hourly pieces. A remainder shorter than an hour stays as its own slot.
function splitIntoSlots(startTime, endTime) {
  const out = [];
  let s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);
  while (s < e) {
    const next = Math.min(s + 60, e);
    out.push({ start: toHHMM(s), end: toHHMM(next), duration: next - s });
    s = next;
  }
  return out;
}

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

// Build the bookable slots for one faculty member.
//   official:     [{dayOfWeek, startTime, endTime}]            recurring weekly
//   added:        [{date, startTime, endTime}]                 one specific date
//   classes:      [{dayOfWeek, startTime, endTime}]            teaching blocks
//   appointments: [{date, time, duration, status}]             PENDING / APPROVED matter
//   today:        "YYYY-MM-DD" (Manila)   nowMs: epoch ms   flaggedDate: date the faculty is out
function buildSlots({ official, added, classes, appointments, today, nowMs, weeks = 4, leadHours = 12, flaggedDate = '' }) {
  const slots = [];
  const days = weeks * 7;

  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    if (date === flaggedDate) continue;
    const dow = dayOfWeekOf(date);
    if (dow === 0) continue; // no Sunday consultations

    const blocks = [
      ...official.filter(h => h.dayOfWeek === dow).map(h => ({ ...h, kind: 'OFFICIAL' })),
      ...added.filter(h => h.date === date).map(h => ({ ...h, kind: 'ADDED' })),
    ];
    const dayClasses = classes.filter(c => c.dayOfWeek === dow);
    const dayApts = appointments.filter(a => a.date === date);

    for (const block of blocks) {
      for (const piece of splitIntoSlots(block.startTime, block.endTime)) {
        const s = timeToMinutes(piece.start);
        const e = timeToMinutes(piece.end);
        if (s < OPERATING_START || s > OPERATING_LAST_START) continue;
        const startMs = new Date(`${date}T${piece.start}:00+08:00`).getTime();
        if ((startMs - nowMs) / 36e5 < leadHours) continue;
        if (dayClasses.some(c => overlaps(s, e, timeToMinutes(c.startTime), timeToMinutes(c.endTime)))) continue;

        const hit = dayApts.filter(a => {
          const as = timeToMinutes(a.time);
          return overlaps(s, e, as, as + (Number(a.duration) || 60));
        });
        if (hit.some(a => a.status === 'APPROVED')) continue; // already taken
        const pending = hit.filter(a => a.status === 'PENDING').length;

        // The same time can be both official and added hours; keep one slot.
        if (slots.some(x => x.date === date && x.start === piece.start)) continue;
        slots.push({
          date, start: piece.start, end: piece.end, duration: piece.duration,
          kind: block.kind, pending, full: pending >= MAX_PENDING_PER_SLOT,
        });
      }
    }
  }
  return slots.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

// Is [time, time+duration) fully inside one official block for that date's weekday, or one added block for that date?
function insideConsultHours({ date, time, duration, official, added }) {
  const s = timeToMinutes(time);
  const e = s + duration;
  const dow = dayOfWeekOf(date);
  const blocks = [
    ...official.filter(h => h.dayOfWeek === dow),
    ...added.filter(h => h.date === date),
  ];
  return blocks.some(h => s >= timeToMinutes(h.startTime) && e <= timeToMinutes(h.endTime));
}

module.exports = {
  MAX_PENDING_PER_SLOT, splitIntoSlots, buildSlots, insideConsultHours, dayOfWeekOf, addDays, overlaps,
};
