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
//   added:        [{dayOfWeek, startTime, endTime}]            recurring weekly, on top of the official hours
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
      ...added.filter(h => h.dayOfWeek === dow).map(h => ({ ...h, kind: 'ADDED' })),
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

// Consultation blocks for a date's weekday, merged so back-to-back blocks (e.g. official 9-10 then added
// 10-11) count as one continuous run. Returns [[startMin, endMin], ...] sorted.
function consultRuns({ date, official, added }) {
  const dow = dayOfWeekOf(date);
  const spans = [...official, ...added]
    .filter(h => h.dayOfWeek === dow)
    .map(h => [timeToMinutes(h.startTime), timeToMinutes(h.endTime)])
    .sort((a, b) => a[0] - b[0]);
  const runs = [];
  for (const [s, e] of spans) {
    const last = runs[runs.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else runs.push([s, e]);
  }
  return runs;
}

// Is [time, time+duration) fully inside one continuous run of official + added consultation hours?
function insideConsultHours({ date, time, duration, official, added }) {
  const s = timeToMinutes(time);
  const e = s + duration;
  return consultRuns({ date, official, added }).some(([rs, re]) => s >= rs && e <= re);
}

// The longest a consultation starting at `time` can be: up to the end of the continuous run it sits in,
// capped at MAX_CONSULT_MINUTES. Returns 0 when `time` is outside consultation hours.
const MAX_CONSULT_MINUTES = 120;
function maxDurationAt({ date, time, official, added }) {
  const s = timeToMinutes(time);
  const run = consultRuns({ date, official, added }).find(([rs, re]) => s >= rs && s < re);
  return run ? Math.min(run[1] - s, MAX_CONSULT_MINUTES) : 0;
}

module.exports = {
  MAX_PENDING_PER_SLOT, MAX_CONSULT_MINUTES, splitIntoSlots, buildSlots, insideConsultHours, maxDurationAt, consultRuns, dayOfWeekOf, addDays, overlaps,
};
