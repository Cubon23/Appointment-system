const test = require('node:test');
const assert = require('node:assert');
const { buildFacultyAnalytics } = require('./facultyAnalytics');

const apt = (o) => ({ status: 'COMPLETED', date: '2026-10-20', time: '09:00', duration: 60, studentSection: 'BS INFO 4D', reason: 'Capstone / Thesis Consultation', studentId: 's1', ...o });
const today = '2026-10-26';

test('pending requests are not counted anywhere', () => {
  const r = buildFacultyAnalytics({ todayIso: today, appointments: [apt({}), apt({ status: 'PENDING' })] });
  assert.strictEqual(r.outcomes.requests, 1);
  assert.strictEqual(r.outcomes.pending, undefined);
  assert.strictEqual(r.hours, undefined); // consultation-hour use is no longer reported
});
test('counts outcomes, completion, missed and approval rates', () => {
  const r = buildFacultyAnalytics({ todayIso: today, appointments: [
    apt({}), apt({}), apt({ status: 'MISSED (STUDENT)' }), apt({ status: 'CANCELLED BY FACULTY' }),
    apt({ status: 'REJECTED' }), apt({ status: 'CANCELLED BY STUDENT' }), apt({ status: 'APPROVED' }),
  ] });
  assert.strictEqual(r.outcomes.completed, 2);
  assert.strictEqual(r.outcomes.studentNoShows, 1);
  assert.strictEqual(r.outcomes.completionRate, 66.7); // 2 / (2 completed + 1 missed)
  assert.strictEqual(r.outcomes.missedRate, 33.3);
  assert.strictEqual(r.outcomes.approvalRate, 83.3);   // 5 approved-or-later, 1 declined
});
test('rates are null when nothing has happened yet', () => {
  const r = buildFacultyAnalytics({ todayIso: today, appointments: [apt({ status: 'PENDING' })] });
  assert.strictEqual(r.outcomes.completionRate, null);
  assert.strictEqual(r.outcomes.approvalRate, null);
});
test('an accepted appeal does not reduce the miss count', () => {
  const missed = apt({ status: 'MISSED (STUDENT)', appeal: { by: 'STUDENT', status: 'ACCEPTED', reason: 'Family Emergency' } });
  const r = buildFacultyAnalytics({ todayIso: today, appointments: [apt({}), missed] });
  assert.strictEqual(r.outcomes.studentNoShows, 1);
  assert.strictEqual(r.appeals.summary.accepted, 1);
  assert.deepStrictEqual(r.appeals.rows, [{ program: 'BS INFO', year: '4', section: 'D', reason: 'Family Emergency', accepted: 1, rejected: 0 }]);
});
test('heatmap window follows the consultation hours', () => {
  const r = buildFacultyAnalytics({
    todayIso: today,
    official: [{ dayOfWeek: 2, startTime: '09:00', endTime: '11:00' }],
    added: [{ dayOfWeek: 4, startTime: '13:00', endTime: '14:00' }],
    appointments: [apt({}), apt({})], // 2026-10-20 is a Tuesday, 9 AM
  });
  assert.deepStrictEqual(r.heatmap.hours.map(h => h.hour), [9, 10, 11, 12, 13]);
  assert.strictEqual(r.heatmap.cells[0][1], 2); // 9 AM row, Tue column
  assert.strictEqual(r.heatmap.max, 2);
});
test('students split by program and year; purposes grouped case-insensitively', () => {
  const r = buildFacultyAnalytics({ todayIso: today, appointments: [
    apt({}), apt({ reason: ' capstone / thesis consultation ' }), apt({ studentSection: 'BLIS 2A', studentId: 's2', reason: 'Exam / Quiz Result Review' }), apt({ studentSection: 'weird' }),
  ] });
  assert.deepStrictEqual(r.students.byProgram.map(x => x.label), ['BS INFO', 'BLIS', 'Unspecified']);
  assert.strictEqual(r.students.purposes.items[0].count, 3);
  assert.strictEqual(r.students.uniqueStudents, 2);
});
test('monthly trend covers six months ending now', () => {
  const r = buildFacultyAnalytics({ todayIso: today, appointments: [apt({})] });
  assert.strictEqual(r.monthly.length, 6);
  assert.deepStrictEqual(r.monthly[5], { label: "Oct '26", value: 1 });
});
test('no data yields zeros and nulls, not NaN', () => {
  const r = buildFacultyAnalytics({ todayIso: today, appointments: [] });
  assert.strictEqual(r.outcomes.requests, 0);
  assert.deepStrictEqual(r.students.purposes, { total: 0, items: [] });
  assert.strictEqual(r.heatmap.max, 0);
});

test('faculty tiles match the shared report: windows, missed/cancelled split, student-only drilldown', () => {
  const mk = (status, date, name) => ({ status, date, time: '09:00', studentName: name, studentId: name, studentSection: 'BS INFO 3A', reason: 'Advising' });
  const out = buildFacultyAnalytics({
    appointments: [mk('COMPLETED', '2026-10-20', 'Ana'), mk('COMPLETED', '2026-10-21', 'Ana'), mk('MISSED (STUDENT)', '2026-10-22', 'Ben'), mk('CANCELLED BY FACULTY', '2026-10-23', 'Cy'), mk('PENDING', '2026-10-24', 'Di')],
    todayIso: '2026-10-28',
  });
  assert.strictEqual(out.kpis.requests.total, 4); // pending is not counted
  assert.strictEqual(out.kpis.completed.last4, 2);
  assert.strictEqual(out.kpis.missed.student, 1);
  assert.strictEqual(out.kpis.cancelled.faculty, 1);
  assert.deepStrictEqual(out.drilldown.completed.students, [{ name: 'Ana', count: 2 }]);
  assert.deepStrictEqual(out.drilldown.completed.faculty, []);
});
