// Pure rules for the "cancel several appointments at once" list (panelist rule 3.3).
// Appointment date/time are Philippine local time strings.
const CANCEL_CUTOFF_HOURS = 1;
const MAX_BULK = 50;

const hoursUntil = (apt, nowMs) => (new Date(`${apt.date}T${apt.time}:00+08:00`).getTime() - nowMs) / 36e5;

// Can this person cancel this appointment right now, and what does it become?
//   student:  own PENDING or APPROVED request, at least 1 hour before the start -> CANCELLED BY STUDENT
//   faculty:  own APPROVED appointment, at least 1 hour before                  -> CANCELLED BY FACULTY
//             own PENDING request (a decline), until its start time             -> REJECTED
function bulkCancelDecision({ role, userId, userName, apt, nowMs }) {
  if (!apt) return { ok: false, reason: 'Appointment not found.' };
  if (role === 'STUDENT') {
    const mine = apt.studentId ? String(apt.studentId) === String(userId) : apt.studentName === userName;
    if (!mine) return { ok: false, reason: 'Not your appointment.' };
    if (!['PENDING', 'APPROVED'].includes(apt.status)) return { ok: false, reason: 'No longer open.' };
    if (hoursUntil(apt, nowMs) < CANCEL_CUTOFF_HOURS) return { ok: false, reason: 'Less than 1 hour before the start.' };
    return { ok: true, newStatus: 'CANCELLED BY STUDENT' };
  }
  if (role === 'FACULTY') {
    if (String(apt.facultyId) !== String(userId)) return { ok: false, reason: 'Not your appointment.' };
    if (apt.status === 'APPROVED') {
      if (hoursUntil(apt, nowMs) < CANCEL_CUTOFF_HOURS) return { ok: false, reason: 'Less than 1 hour before the start.' };
      return { ok: true, newStatus: 'CANCELLED BY FACULTY' };
    }
    if (apt.status === 'PENDING') {
      if (hoursUntil(apt, nowMs) <= 0) return { ok: false, reason: 'Already started.' };
      return { ok: true, newStatus: 'REJECTED' };
    }
    return { ok: false, reason: 'No longer open.' };
  }
  return { ok: false, reason: 'Not allowed.' };
}

module.exports = { bulkCancelDecision, CANCEL_CUTOFF_HOURS, MAX_BULK };
