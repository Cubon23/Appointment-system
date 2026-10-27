// Week helpers for the student's booking calendar. All dates are Manila "YYYY-MM-DD" strings.
export const manilaToday = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export const addDaysIso = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Monday of the week that contains the date (weeks run Monday to Sunday).
export const mondayOf = (iso: string): string => {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDaysIso(iso, dow === 0 ? -6 : 1 - dow);
};

export const weeksBetween = (fromMonday: string, toMonday: string): number =>
  Math.round((new Date(`${toMonday}T00:00:00Z`).getTime() - new Date(`${fromMonday}T00:00:00Z`).getTime()) / (7 * 864e5));

const fmt = (iso: string, withYear: boolean) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });

// "Nov 2 – Nov 8, 2026" (years shown on both ends when the week crosses New Year)
export const weekLabel = (startIso: string): string => {
  const endIso = addDaysIso(startIso, 6);
  const crossesYear = startIso.slice(0, 4) !== endIso.slice(0, 4);
  return `${fmt(startIso, crossesYear)} – ${fmt(endIso, true)}`;
};

// "Tue, Nov 3, 2026"
export const dayHeading = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
