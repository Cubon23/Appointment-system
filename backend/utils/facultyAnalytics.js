// A faculty member's own analytics, built from their own appointments and consultation hours.
// Pure (no database) so it can be unit-tested. Dates are Manila "YYYY-MM-DD" strings.
// Rules: pending requests are not counted; appeals never reduce misses; consultation-hour
// "use" is not reported (faculty are not required to use all their hours).
const {
  outcomeCounts, buildHeatmap, buildAppealRows, buildAppealSummary, purposeRows, monthlySeries,
  weeklySeries, STUDENT_APPEAL_REASONS, parseCohort,
} = require('./reportMetrics');
const { collapsePurposes } = require('./analyticsHelpers');

const countBy = (items, keyFn) => {
  const m = new Map();
  items.forEach((i) => { const k = keyFn(i); if (k !== null && k !== undefined) m.set(k, (m.get(k) || 0) + 1); });
  return m;
};

function buildFacultyAnalytics({ appointments, official = [], added = [], todayIso }) {
  const c = outcomeCounts(appointments);
  // Share of reviewed requests that were approved: approved-or-later vs declined.
  // (Cancelled-by-student is left out: it may have been cancelled before any decision.)
  const approvedOrLater = c.upcoming + c.completed + c.missed + c.cancelledFaculty;
  const approvalRate = approvedOrLater + c.declined ? Math.round((approvedOrLater / (approvedOrLater + c.declined)) * 1000) / 10 : null;

  const counted = appointments.filter((a) => a.status !== 'PENDING');
  const cohorts = counted.map((a) => parseCohort(a.studentSection));
  const tally = (pick, order) => {
    const m = countBy(cohorts, pick);
    return [...m.entries()].sort(order).map(([label, value]) => ({ label, value }));
  };

  return {
    outcomes: {
      requests: c.requests,
      completed: c.completed,
      upcoming: c.upcoming,
      declined: c.declined,
      studentNoShows: c.missedStudent,
      missedByFaculty: c.missedFaculty,
      cancelledByStudent: c.cancelledStudent,
      cancelledByFaculty: c.cancelledFaculty,
      completionRate: c.completionRate,
      missedRate: c.missedRate,
      approvalRate,
    },
    weekly: weeklySeries(appointments, todayIso),
    monthly: monthlySeries(appointments, todayIso),
    heatmap: buildHeatmap(appointments, [...official, ...added]),
    appeals: {
      summary: buildAppealSummary(appointments),
      rows: buildAppealRows(appointments),
      reasons: [...STUDENT_APPEAL_REASONS, 'Other'],
    },
    students: {
      uniqueStudents: new Set(counted.map((a) => String(a.studentId || a.studentName))).size,
      byProgram: tally((x) => x.program, (a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))),
      byYear: tally((x) => (x.year ? `Year ${x.year}` : 'Unspecified'), (a, b) => String(a[0]).localeCompare(String(b[0]))),
      purposes: collapsePurposes(purposeRows(appointments)),
    },
  };
}

module.exports = { buildFacultyAnalytics };
