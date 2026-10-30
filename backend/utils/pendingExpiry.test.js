const test = require('node:test');
const assert = require('node:assert');
const { isExpired } = require('./pendingExpiry');

const at = (iso) => new Date(iso).getTime();
const apt = (over = {}) => ({ status: 'PENDING', date: '2026-10-30', time: '10:00', ...over });

test('a pending request expires when its start time is reached, not before', () => {
  assert.strictEqual(isExpired(apt(), at('2026-10-30T09:59:59+08:00')), false);
  assert.strictEqual(isExpired(apt(), at('2026-10-30T10:00:00+08:00')), true);
  assert.strictEqual(isExpired(apt(), at('2026-10-31T00:00:00+08:00')), true); // catches up after downtime
});
test('only pending requests expire', () => {
  for (const status of ['APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED BY STUDENT', 'MISSED (STUDENT)']) {
    assert.strictEqual(isExpired(apt({ status }), at('2026-11-01T00:00:00+08:00')), false);
  }
});
test('Manila time is used, not the server clock', () => {
  // 10:00 Manila = 02:00 UTC
  assert.strictEqual(isExpired(apt(), at('2026-10-30T01:59:00Z')), false);
  assert.strictEqual(isExpired(apt(), at('2026-10-30T02:00:00Z')), true);
});
