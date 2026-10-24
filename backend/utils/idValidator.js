// Official ID formats. One place so the User model, Admin tools and onboarding agree.
//   Student:  2025-S00001  or  2025-1234-A
//   Employee: 2025S-00001
const STUDENT_ID_REGEX = /^\d{4}-(S\d{5}|\d{4}-[A-Z])$/;
const EMPLOYEE_ID_REGEX = /^\d{4}S-\d{5}$/;

const STUDENT_ID_HINT = '2025-S00001 or 2025-1234-A';
const EMPLOYEE_ID_HINT = '2025S-00001';

// Returns { ok, id, error }. kind is 'STUDENT' or 'EMPLOYEE'.
function validateId(raw, kind) {
  const id = String(raw || '').trim().toUpperCase();
  if (!id) return { ok: false, id, error: 'ID is required.' };
  const isStudent = kind === 'STUDENT';
  if (!(isStudent ? STUDENT_ID_REGEX : EMPLOYEE_ID_REGEX).test(id)) {
    return { ok: false, id, error: `Invalid ${isStudent ? 'Student' : 'Employee'} ID format. Expected: ${isStudent ? STUDENT_ID_HINT : EMPLOYEE_ID_HINT}` };
  }
  return { ok: true, id };
}

module.exports = { STUDENT_ID_REGEX, EMPLOYEE_ID_REGEX, STUDENT_ID_HINT, EMPLOYEE_ID_HINT, validateId };
