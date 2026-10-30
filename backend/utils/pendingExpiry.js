// Pure rule for the auto-rejection of unanswered requests (no database here, so it can be tested).
// Appointment date/time are Philippine local time strings ("YYYY-MM-DD", "HH:MM").
const startMs = (date, time) => new Date(`${date}T${time}:00+08:00`).getTime();

// A PENDING request expires the moment its requested start time is reached.
function isExpired(apt, nowMs) {
  return !!apt && apt.status === 'PENDING' && !!apt.date && !!apt.time && startMs(apt.date, apt.time) <= nowMs;
}

const EXPIRY_REASON = 'The faculty did not respond before the requested time.';

module.exports = { isExpired, EXPIRY_REASON, startMs };
