// A faculty member's own analytics, built from their own appointments and consultation hours.
// Pure (no database) so it can be unit-tested. Dates are Manila "YYYY-MM-DD" strings.
const { collapsePurposes } = require('./analyticsHelpers');

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const dayOf = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const hourLabel = (h) => `${((h + 11) % 12) + 1} ${h >= 12 ? 'PM' : 'AM'}`;
const PROGRAM_RE = /^(.+?)\s+(\d)([A-Za-z])$/;

const isCancelled = (s) => String(s).startsWith('CANCELLED');
const isMissed = (s) => String(s).startsWith('MISSED');
const countBy = (items, keyFn) => {
  const m = new Map();
  items.forEach(i => { const k = keyFn(i); if (k !== null && k !== undefined) m.set(k, (m.get(k) || 0) + 1); });
  return m;
};

function buildFacultyAnalytics({ appointments, official = [], added = [], todayIso }) {
  const by = (pred) => appointments.filter(a => pred(a.status)).length;

  const completed = by(s => s === 'COMPLETED');
  const missedStudent = by(s => s === 'MISSED (STUDENT)');
  const missedFaculty = by(s => s === 'MISSED (FACULTY)');
  const cancelledByFaculty = by(s => s === 'CANCELLED BY FACULTY' || s === 'CANCELLED (FACULTY ON LEAVE)');
  const finished = completed + missedStudent + missedFaculty + cancelledByFaculty;

  const outcomes = {
    total: appointments.length,
    pending: by(s => s === 'PENDING'),
    approved: by(s => s === 'APPROVED'),
    completed,
    rejected: by(s => s === 'REJECTED'),
    cancelledByStudent: by(s => s === 'CANCELLED BY STUDENT'),
    cancelledByFaculty,
    studentNoShows: missedStudent,
    missedByFaculty: missedFaculty,
    // Of the consultations that were supposed to happen, how many actually did
    completionRate: finished ? Math.round((completed / finished) * 1000) / 10 : null,
    appeals: {
      received: appointments.filter(a => a.appeal?.by === 'STUDENT').length,
      accepted: appointments.filter(a => a.appeal?.by === 'STUDENT' && a.appeal.status === 'ACCEPTED').length,
      made: appointments.filter(a => a.appeal?.by === 'FACULTY').length,
    },
  };

  // --- Consultation hours use ---
  const weeklyAvailable = [...official, ...added].reduce((s, h) => s + (toMin(h.endTime) - toMin(h.startTime)), 0);
  const windowStart = addDays(todayIso, -27);
  const heldStatuses = (s) => s === 'COMPLETED' || s === 'APPROVED' || isMissed(s);
  const recentHeld = appointments.filter(a => heldStatuses(a.status) && a.date >= windowStart && a.date <= todayIso);
  const bookedMin = recentHeld.reduce((s, a) => s + (Number(a.duration) || 60), 0);
  const capacity = weeklyAvailable * 4;
  const everHeld = appointments.filter(a => heldStatuses(a.status));
  const dayCounts = countBy(everHeld, a => dayOf(a.date));
  const hourCounts = countBy(everHeld, a => Math.floor(toMin(a.time) / 60));

  const hours = {
    weeklyAvailableMinutes: weeklyAvailable,
    officialMinutes: official.reduce((s, h) => s + (toMin(h.endTime) - toMin(h.startTime)), 0),
    addedMinutes: added.reduce((s, h) => s + (toMin(h.endTime) - toMin(h.startTime)), 0),
    bookedMinutesLast4Weeks: bookedMin,
    utilizationPercent: capacity ? Math.min(100, Math.round((bookedMin / capacity) * 1000) / 10) : null,
    byDay: [1, 2, 3, 4, 5, 6].map(d => ({ label: DAY_NAMES[d], value: dayCounts.get(d) || 0 })),
    byHour: [...hourCounts.entries()].sort((a, b) => a[0] - b[0]).map(([h, c]) => ({ label: hourLabel(h), value: c })),
  };

  // --- Students and purposes ---
  const programRows = (idx) => {
    const m = countBy(appointments, a => { const p = PROGRAM_RE.exec(String(a.studentSection || '').trim()); return p ? (idx === 0 ? p[1] : `Year ${p[2]}`) : 'Unspecified'; });
    return [...m.entries()].sort((a, b) => (idx === 0 ? b[1] - a[1] : String(a[0]).localeCompare(String(b[0])))).map(([label, value]) => ({ label, value }));
  };
  const purposeMap = countBy(appointments, a => String(a.reason || '').trim().toLowerCase() || null);
  const purposeRows = [...purposeMap.entries()].sort((a, b) => b[1] - a[1]).map(([purpose, count]) => ({ purpose, count }));

  return {
    outcomes,
    hours,
    students: {
      uniqueStudents: new Set(appointments.map(a => String(a.studentId || a.studentName))).size,
      byProgram: programRows(0),
      byYear: programRows(1),
      purposes: collapsePurposes(purposeRows),
    },
  };
}

module.exports = { buildFacultyAnalytics };
