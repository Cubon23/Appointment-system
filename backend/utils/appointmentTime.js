// Pure time rules for appointments (date "YYYY-MM-DD" and time "HH:MM" are Manila time, UTC+8).

const BOOKING_LEAD_HOURS = 1;  // students may request up to 1 hour before the start
const CANCEL_CUTOFF_HOURS = 1; // students and faculty may cancel up to 1 hour before the start
const REMINDER_MINUTES = 30;   // upcoming-consultation reminder

const startMoment = (date, time) => new Date(`${date}T${time}:00+08:00`);
const minutesUntil = (date, time, nowMs = Date.now()) => (startMoment(date, time).getTime() - nowMs) / 60000;

// A request nobody answered by its start time: the system rejects it.
const isPendingExpired = (apt, nowMs = Date.now()) => apt.status === 'PENDING' && minutesUntil(apt.date, apt.time, nowMs) <= 0;

// True when the start is still ahead but at most `minutes` away (reminder window).
const inReminderWindow = (apt, nowMs = Date.now(), minutes = REMINDER_MINUTES) => {
  const m = minutesUntil(apt.date, apt.time, nowMs);
  return m > 0 && m <= minutes;
};

// Cancelling (student or faculty) is allowed until CANCEL_CUTOFF_HOURS before the start.
const canCancel = (apt, nowMs = Date.now()) => minutesUntil(apt.date, apt.time, nowMs) >= CANCEL_CUTOFF_HOURS * 60;

module.exports = { BOOKING_LEAD_HOURS, CANCEL_CUTOFF_HOURS, REMINDER_MINUTES, startMoment, minutesUntil, isPendingExpired, inReminderWindow, canCancel };
