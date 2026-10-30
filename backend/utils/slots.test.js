const test = require('node:test');
const assert = require('node:assert');
const { splitIntoSlots, buildSlots, insideConsultHours, maxDurationAt, dayOfWeekOf } = require('./slots');

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

// 2026-10-26 is a Monday. "now" is Mon 00:00 Manila so the lead time excludes nothing later in the week.
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
test('added hours recur every week on their weekday', () => {
  const s = buildSlots({ ...base, weeks: 2, added: [{ dayOfWeek: 4, startTime: '13:00', endTime: '14:00' }] });
  const a = s.filter(x => x.kind === 'ADDED');
  assert.deepStrictEqual(a.map(x => `${x.date} ${x.start}`), ['2026-10-29 13:00', '2026-11-05 13:00']); // Thursdays
});
test('slots inside the 1-hour lead time are hidden', () => {
  // Tue 08:30 -> the 09:00 slot is only 30 min away (hidden); 10:00 is 1.5 h away (shown)
  const s = buildSlots({ ...base, today: '2026-10-27', nowMs: new Date('2026-10-27T08:30:00+08:00').getTime() });
  assert.deepStrictEqual(s.filter(x => x.date === '2026-10-27').map(x => x.start), ['10:00']);
});
test('a slot exactly 1 hour away is still bookable', () => {
  const s = buildSlots({ ...base, today: '2026-10-27', nowMs: new Date('2026-10-27T08:00:00+08:00').getTime() });
  assert.deepStrictEqual(s.filter(x => x.date === '2026-10-27').map(x => x.start), ['09:00', '10:00']);
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

test('back-to-back official and added hours form one continuous run', () => {
  const args = { official: [{ dayOfWeek: 2, startTime: '09:00', endTime: '10:00' }], added: [{ dayOfWeek: 2, startTime: '10:00', endTime: '11:00' }] };
  assert.ok(insideConsultHours({ date: '2026-10-27', time: '09:30', duration: 90, ...args }));
});
test('maxDurationAt is the rest of the continuous run, capped at 2 hours', () => {
  const two = { official: [{ dayOfWeek: 2, startTime: '09:00', endTime: '11:00' }], added: [] };
  assert.strictEqual(maxDurationAt({ date: '2026-10-27', time: '09:00', ...two }), 120);
  assert.strictEqual(maxDurationAt({ date: '2026-10-27', time: '10:00', ...two }), 60);
  assert.strictEqual(maxDurationAt({ date: '2026-10-27', time: '11:00', ...two }), 0); // outside
  const four = { official: [{ dayOfWeek: 2, startTime: '08:00', endTime: '12:00' }], added: [] };
  assert.strictEqual(maxDurationAt({ date: '2026-10-27', time: '08:00', ...four }), 120); // cap
});
