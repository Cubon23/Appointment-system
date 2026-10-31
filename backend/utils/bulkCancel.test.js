const test = require('node:test');
const assert = require('node:assert');
const { bulkCancelDecision } = require('./bulkCancel');

const now = new Date('2026-11-02T08:00:00+08:00').getTime();
const apt = (o = {}) => ({ studentId: 's1', facultyId: 'f1', studentName: 'Ana', status: 'APPROVED', date: '2026-11-02', time: '10:00', ...o });
const stu = (a) => bulkCancelDecision({ role: 'STUDENT', userId: 's1', userName: 'Ana', apt: a, nowMs: now });
const fac = (a, userId = 'f1') => bulkCancelDecision({ role: 'FACULTY', userId, apt: a, nowMs: now });

test('student: own open appointment, at least 1 hour ahead', () => {
  assert.deepStrictEqual(stu(apt()), { ok: true, newStatus: 'CANCELLED BY STUDENT' });
  assert.deepStrictEqual(stu(apt({ status: 'PENDING' })), { ok: true, newStatus: 'CANCELLED BY STUDENT' });
  assert.strictEqual(stu(apt({ time: '08:30' })).ok, false); // 30 minutes away
  assert.strictEqual(stu(apt({ time: '09:00' })).ok, true);  // exactly 1 hour away
  assert.strictEqual(stu(apt({ status: 'COMPLETED' })).ok, false);
  assert.strictEqual(stu(apt({ studentId: 's2' })).ok, false);
});
test('student without studentId falls back to the name', () => {
  assert.strictEqual(stu(apt({ studentId: undefined })).ok, true);
  assert.strictEqual(stu(apt({ studentId: undefined, studentName: 'Ben' })).ok, false);
});
test('faculty: approved is cancelled (1 hour rule); pending is declined until the start', () => {
  assert.deepStrictEqual(fac(apt()), { ok: true, newStatus: 'CANCELLED BY FACULTY' });
  assert.strictEqual(fac(apt({ time: '08:30' })).ok, false);
  assert.deepStrictEqual(fac(apt({ status: 'PENDING', time: '08:30' })), { ok: true, newStatus: 'REJECTED' });
  assert.strictEqual(fac(apt({ status: 'PENDING', time: '07:00' })).ok, false); // already started
  assert.strictEqual(fac(apt(), 'f2').ok, false);
});
