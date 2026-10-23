const test = require('node:test');
const assert = require('node:assert');
const { decideSignIn } = require('./signInPolicy');

const base = { allowedDomains: ['school.edu.ph'], adminEmails: ['boss@school.edu.ph'], existingUser: null, rosterRole: null };
const ok = (email) => ({ email, email_verified: true });

test('rejects unverified email', () => {
  assert.strictEqual(decideSignIn({ ...base, payload: { email: 'a@school.edu.ph', email_verified: false } }).action, 'DENY');
});
test('rejects other domains', () => {
  assert.strictEqual(decideSignIn({ ...base, payload: ok('a@gmail.com') }).action, 'DENY');
});
test('rejects lookalike domain', () => {
  assert.strictEqual(decideSignIn({ ...base, payload: ok('a@evil-school.edu.ph') }).action, 'DENY');
});
test('unknown school email becomes STUDENT', () => {
  assert.deepStrictEqual(decideSignIn({ ...base, payload: ok('a@school.edu.ph') }), { action: 'CREATE', role: 'STUDENT' });
});
test('roster gives faculty role', () => {
  assert.strictEqual(decideSignIn({ ...base, payload: ok('f@school.edu.ph'), rosterRole: 'FACULTY' }).role, 'FACULTY');
});
test('ADMIN_EMAILS bootstrap wins', () => {
  assert.strictEqual(decideSignIn({ ...base, payload: ok('Boss@school.edu.ph'), rosterRole: 'FACULTY' }).role, 'ADMIN');
});
test('existing active user logs in', () => {
  assert.strictEqual(decideSignIn({ ...base, payload: ok('a@school.edu.ph'), existingUser: { accountStatus: 'ACTIVE' } }).action, 'LOGIN');
});
test('archived user denied', () => {
  assert.strictEqual(decideSignIn({ ...base, payload: ok('a@school.edu.ph'), existingUser: { accountStatus: 'ARCHIVED' } }).action, 'DENY');
});
test('no domain configured denies everyone', () => {
  assert.strictEqual(decideSignIn({ ...base, allowedDomains: [], payload: ok('a@school.edu.ph') }).action, 'DENY');
});
