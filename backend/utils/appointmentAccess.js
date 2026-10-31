// Who may open one appointment's details (the drawer a notification link opens).
//   - a student: only their own appointments
//   - a faculty member: only appointments with them
//   - the Dean and Admin: any appointment (they already see every record in their reports)
// `apt.facultyId` may be a plain id or a populated user object.

const idOf = (v) => (v && v._id ? String(v._id) : v ? String(v) : '');

function canViewAppointment(user, apt) {
  if (!user || !apt) return false;
  if (user.role === 'ADMIN' || user.role === 'DEAN') return true;
  const me = String(user.userId || '');
  if (!me) return false;
  if (user.role === 'FACULTY') return idOf(apt.facultyId) === me;
  if (user.role === 'STUDENT') return !!apt.studentId && idOf(apt.studentId) === me;
  return false;
}

module.exports = { canViewAppointment };
