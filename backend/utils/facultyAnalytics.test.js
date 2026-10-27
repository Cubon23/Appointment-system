const test = require('node:test');
const assert = require('node:assert');
const { buildFacultyAnalytics } = require('./facultyAnalytics');

const apt = (o) => ({ status: 'COMPLETED', date: '2026-10-20', time: '09:00', duration: 60, studentSection: 'BS INFO 4D', reason: 'Capstone / Thesis Consultation', studentId: 's1', ...o });
const today = '2026-10-26';

test('counts outcomes and completion rate', () => {
  const r = buildFacultyAnalytics({ todayIso: today, appointments: [
    apt({}), apt({}), apt({ status: 'MISSED (STUDENT)' }), apt({ status: 'CANCELLED BY FACULTY' }),
    apt({ status: 'PENDING' }), apt({ status: 'REJECTED' }), apt({ status: 'CANCELLED BY STUDENT' }),
  ] });
  assert.strictEqual(r.outcomes.total, 7);
  assert.strictEqual(r.outcomes.completed, 2);
  assert.strictEqual(r.outcomes.studentNoShows, 1);
  assert.strictEqual(r.outcomes.cancelledByFaculty, 1);
  assert.strictEqual(r.outcomes.completionRate, 50); // 2 of 4 that should have happened
});
test('completion rate is null when nothing has happened yet', () => {
  assert.strictEqual(buildFacultyAnalytics({ todayIso: today, appointments: [apt({ status: 'PENDING' })] }).outcomes.completionRate, null);
});
test('utilization = booked minutes in last 4 weeks over 4 weeks of available hours', () => {
  const r = buildFacultyAnalytics({
    todayIso: today,
    official: [{ dayOfWeek: 2, startTime: '09:00', endTime: '11:00' }],  // 120 min/week
    added: [{ dayOfWeek: 4, startTime: '13:00', endTime: '14:00' }],     // +60
    appointments: [apt({}), apt({ date: '2026-10-13' }), apt({ date: '2026-08-01' })], // third is outside the window
  });
  assert.strictEqual(r.hours.weeklyAvailableMinutes, 180);
  assert.strictEqual(r.hours.bookedMinutesLast4Weeks, 120);
  assert.strictEqual(r.hours.utilizationPercent, 16.7); // 120 / 720
});
test('busiest day and hour use consultations that happened or are booked', () => {
  const r = buildFacultyAnalytics({ todayIso: today, appointments: [apt({}), apt({}), apt({ status: 'REJECTED' })] });
  assert.deepStrictEqual(r.hours.byDay.find(d => d.label === 'Tue'), { label: 'Tue', value: 2 }); // 2026-10-20 is a Tuesday
  assert.deepStrictEqual(r.hours.byHour, [{ label: '9 AM', value: 2 }]);
});
test('students split by program and year; purposes grouped case-insensitively', () => {
  const r = buildFacultyAnalytics({ todayIso: today, appointments: [
    apt({}), apt({ reason: ' capstone / thesis consultation ' }), apt({ studentSection: 'BLIS 2A', studentId: 's2', reason: 'Exam / Quiz Result Review' }), apt({ studentSection: 'weird' }),
  ] });
  assert.deepStrictEqual(r.students.byProgram.map(x => x.label), ['BS INFO', 'BLIS', 'Unspecified']);
  assert.strictEqual(r.students.purposes.items[0].count, 3);
  assert.strictEqual(r.students.uniqueStudents, 2);
});
test('no data yields zeros and nulls, not NaN', () => {
  const r = buildFacultyAnalytics({ todayIso: today, appointments: [] });
  assert.strictEqual(r.outcomes.total, 0);
  assert.strictEqual(r.hours.utilizationPercent, null);
  assert.deepStrictEqual(r.students.purposes, { total: 0, items: [] });
});
