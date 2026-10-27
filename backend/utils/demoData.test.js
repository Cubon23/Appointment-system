const test = require('node:test');
const assert = require('node:assert');
const { buildDemoData } = require('./demoData');
const { STUDENT_ID_REGEX, EMPLOYEE_ID_REGEX } = require('./idValidator');

const data = buildDemoData({ today: '2026-10-28' });

test('demo users are unusable fake accounts with valid ids', () => {
  assert.ok(data.students.length >= 20);
  for (const s of data.students) { assert.match(s.email, /@demo\.invalid$/); assert.ok(STUDENT_ID_REGEX.test(s.schoolId), s.schoolId); assert.match(s.programPosition, /^.+ \d[A-E]$/); }
  for (const f of data.faculty) { assert.match(f.email, /@demo\.invalid$/); assert.ok(EMPLOYEE_ID_REGEX.test(f.facultyId), f.facultyId); }
});

test('appointments cover past dates only, use known keys, and are repeatable', () => {
  const fk = new Set(data.faculty.map(f => f.key)), sk = new Set(data.students.map(s => s.key));
  assert.ok(data.appointments.length > 50);
  for (const a of data.appointments) { assert.ok(a.date < '2026-10-28'); assert.ok(fk.has(a.facultyKey) && sk.has(a.studentKey)); assert.notStrictEqual(a.status, 'PENDING'); }
  assert.deepStrictEqual(buildDemoData({ today: '2026-10-28' }).appointments, data.appointments);
});

test('there are appeals in more than one state', () => {
  const states = new Set(data.appointments.filter(a => a.appeal).map(a => a.appeal.status));
  assert.ok(states.has('ACCEPTED') && states.has('REJECTED'));
});
