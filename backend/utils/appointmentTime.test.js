const test = require('node:test');
const assert = require('node:assert');
const t = require('./appointmentTime');

const apt = { status: 'PENDING', date: '2026-11-03', time: '10:00' };
const at = (hhmm) => new Date(`2026-11-03T${hhmm}:00+08:00`).getTime();

test('limits are 1 hour to book / cancel and a 30-minute reminder', () => {
  assert.strictEqual(t.BOOKING_LEAD_HOURS, 1);
  assert.strictEqual(t.CANCEL_CUTOFF_HOURS, 1);
  assert.strictEqual(t.REMINDER_MINUTES, 30);
});

test('a pending request expires exactly when the start time is reached', () => {
  assert.strictEqual(t.isPendingExpired(apt, at('09:59')), false);
  assert.strictEqual(t.isPendingExpired(apt, at('10:00')), true);
  assert.strictEqual(t.isPendingExpired(apt, at('11:30')), true);
  assert.strictEqual(t.isPendingExpired({ ...apt, status: 'APPROVED' }, at('11:30')), false);
});

test('cancel stays open until 1 hour before the start', () => {
  assert.strictEqual(t.canCancel(apt, at('09:00')), true);
  assert.strictEqual(t.canCancel(apt, at('09:01')), false);
  assert.strictEqual(t.canCancel(apt, at('10:00')), false);
});

test('reminder window is the last 30 minutes before the start', () => {
  assert.strictEqual(t.inReminderWindow(apt, at('09:29')), false);
  assert.strictEqual(t.inReminderWindow(apt, at('09:30')), true);
  assert.strictEqual(t.inReminderWindow(apt, at('09:59')), true);
  assert.strictEqual(t.inReminderWindow(apt, at('10:00')), false);
});
