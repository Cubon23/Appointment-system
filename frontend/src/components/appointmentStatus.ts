// One place for how appointment statuses are named and coloured on every dashboard.
const LABELS: Record<string, string> = {
  'CANCELLED BY STUDENT': 'Cancelled by student',
  'CANCELLED BY FACULTY': 'Cancelled by faculty',
  'CANCELLED (FACULTY ON LEAVE)': 'Cancelled (faculty on leave)',
  'MISSED (STUDENT)': 'Student no-show',
  'MISSED (FACULTY)': 'Missed by faculty',
};

export const statusLabel = (status: string): string => LABELS[status] ?? status;

export const statusColor = (status: string): string => {
  if (status === 'APPROVED') return 'green';
  if (status === 'REJECTED') return 'red';
  if (status === 'PENDING') return 'yellow';
  if (status === 'COMPLETED') return 'blue';
  if (status.startsWith('MISSED')) return 'orange';
  return 'gray'; // all CANCELLED variants
};

// Time limits (must match the backend): students book 12+ hours ahead; every response
// to a request (student cancel, faculty approve / reject / cancel) needs 8+ hours ahead.
export const BOOKING_LEAD_HOURS = 12;
export const CANCEL_CUTOFF_HOURS = 8;

export const hoursUntil = (date: string, time: string): number =>
  (new Date(`${date}T${time}:00+08:00`).getTime() - Date.now()) / 36e5;

// True while there are still 8+ hours before the appointment: the window in which a
// student can cancel, and in which faculty can approve / reject / cancel.
export const isBeforeCutoff = (date: string, time: string): boolean =>
  hoursUntil(date, time) >= CANCEL_CUTOFF_HOURS;

// True once the appointment's start time has passed (appointment date/time are Philippine time).
export const hasStarted = (date: string, time: string): boolean =>
  Date.now() >= new Date(`${date}T${time}:00+08:00`).getTime();
