const test = require('node:test');
const assert = require('node:assert');
const { splitIntoSlots, buildSlots, insideConsultHours, dayOfWeekOf } = require('./slots');

test('splits a 2-hour block into two 1-hour slots', () => {
  assert.deepStrictEqual(splitIntoSlots('09:00', '11:00').map(s => `${s.start}-${s.end}`), ['09:00-10:00', '10:00-11:00']);
});
test('keeps the shorter remainder as its own slot', () => {
  const s = splitIntoSlots('09:30', '11:00');
  assert.deepStrictEqual(s.map(x => `${x.start}-${x.end}:${x.duration}`), ['09:30-10:30:60', '10:30-11:00:30']);
});
test('day of week is timezone independent', () => {
  assert.strictEqual(dayOfWeekOf('2026-10-27'), 2); // Tuesday
});

// 2026-10-26 is a Monday. "now" is Mon 00:00 Manila so the 12-hour lead excludes nothing later in the week.
const base = {
  official: [{ dayOfWeek: 2, startTime: '09:00', endTime: '11:00' }],
  added: [], classes: [], appointments: [],
  today: '2026-10-26', nowMs: new Date('2026-10-26T00:00:00+08:00').getTime(), weeks: 1,
};

test('official weekly hours become hourly slots on the next matching date', () => {
  const s = buildSlots(base);
  assert.deepStrictEqual(s.map(x => `${x.date} ${x.start}`), ['2026-10-27 09:00', '2026-10-27 10:00']);
  assert.ok(s.every(x => x.kind === 'OFFICIAL' && !x.full));
});
test('added hours appear only on their date', () => {
  const s = buildSlots({ ...base, added: [{ date: '2026-10-29', startTime: '13:00', endTime: '14:00' }] });
  const a = s.filter(x => x.kind === 'ADDED');
  assert.deepStrictEqual(a.map(x => `${x.date} ${x.start}`), ['2026-10-29 13:00']);
});
test('slots inside the 12-hour lead time are hidden', () => {
  const s = buildSlots({ ...base, nowMs: new Date('2026-10-26T21:30:00+08:00').getTime() });
  assert.deepStrictEqual(s.map(x => x.start), ['10:00']); // 09:00 is 11.5h away, 10:00 is 12.5h away
});
test('an approved appointment removes the slot', () => {
  const s = buildSlots({ ...base, appointments: [{ date: '2026-10-27', time: '09:00', duration: 60, status: 'APPROVED' }] });
  assert.deepStrictEqual(s.map(x => x.start), ['10:00']);
});
test('three pending requests mark the slot full; two do not', () => {
  const pend = (n) => Array.from({ length: n }, () => ({ date: '2026-10-27', time: '09:00', duration: 60, status: 'PENDING' }));
  assert.strictEqual(buildSlots({ ...base, appointments: pend(2) })[0].full, false);
  assert.strictEqual(buildSlots({ ...base, appointments: pend(3) })[0].full, true);
  assert.strictEqual(buildSlots({ ...base, appointments: pend(3) })[0].pending, 3);
});
test('a class overlapping the slot hides it', () => {
  const s = buildSlots({ ...base, classes: [{ dayOfWeek: 2, startTime: '09:30', endTime: '10:30' }] });
  assert.strictEqual(s.length, 0); // both hourly slots touch the class
});
test('the date the faculty is out is skipped', () => {
  assert.strictEqual(buildSlots({ ...base, flaggedDate: '2026-10-27' }).length, 0);
});
test('insideConsultHours checks the whole range', () => {
  const args = { official: base.official, added: [] };
  assert.ok(insideConsultHours({ date: '2026-10-27', time: '10:00', duration: 60, ...args }));
  assert.ok(!insideConsultHours({ date: '2026-10-27', time: '10:30', duration: 60, ...args }));
  assert.ok(!insideConsultHours({ date: '2026-10-28', time: '10:00', duration: 60, ...args }));
});
