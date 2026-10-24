const test = require('node:test');
const assert = require('node:assert');
const { validateId } = require('./idValidator');

test('accepts both student formats', () => {
  assert.ok(validateId('2025-S00001', 'STUDENT').ok);
  assert.ok(validateId('2025-1234-a', 'STUDENT').ok); // lowercase is normalised
});
test('accepts employee format', () => assert.ok(validateId('2025S-00001', 'EMPLOYEE').ok));
test('rejects employee ID typed as student and vice versa', () => {
  assert.ok(!validateId('2025S-00001', 'STUDENT').ok);
  assert.ok(!validateId('2025-S00001', 'EMPLOYEE').ok);
});
test('rejects empty and malformed IDs', () => {
  assert.ok(!validateId('', 'STUDENT').ok);
  assert.ok(!validateId('2025-S0001', 'STUDENT').ok);
  assert.ok(!validateId('UA-COSFM-2022-1234', 'EMPLOYEE').ok);
});
