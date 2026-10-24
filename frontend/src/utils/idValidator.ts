// Official ID formats (keep in sync with backend/utils/idValidator.js).
//   Student:  2025-S00001  or  2025-1234-A
//   Employee: 2025S-00001
export const STUDENT_ID_REGEX = /^\d{4}-(S\d{5}|\d{4}-[A-Z])$/;
export const EMPLOYEE_ID_REGEX = /^\d{4}S-\d{5}$/;

export const idHint = (kind: 'STUDENT' | 'EMPLOYEE') =>
  kind === 'STUDENT' ? '2025-S00001 or 2025-1234-A' : '2025S-00001';

export const isValidId = (raw: string, kind: 'STUDENT' | 'EMPLOYEE'): boolean =>
  (kind === 'STUDENT' ? STUDENT_ID_REGEX : EMPLOYEE_ID_REGEX).test(raw.trim().toUpperCase());
