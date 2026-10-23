// Pure sign-in rules (no database, no network) so they can be unit-tested.

const parseList = (v) => (v || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

// Google's verified ID-token payload + config + what we already know -> what to do.
// payload: { email, email_verified, hd }   existingUser: User doc or null   rosterRole: string|null
function decideSignIn({ payload, allowedDomains, adminEmails, existingUser, rosterRole }) {
  const email = (payload?.email || '').toLowerCase();
  if (!email || payload.email_verified !== true) {
    return { action: 'DENY', error: 'Your Google email is not verified.' };
  }
  const domain = email.split('@')[1];
  if (!allowedDomains.length || !allowedDomains.includes(domain)) {
    return { action: 'DENY', error: 'Please sign in with your school Google account.' };
  }
  if (existingUser) {
    if (existingUser.accountStatus === 'ARCHIVED' || existingUser.accountStatus === 'RESTRICTED') {
      return { action: 'DENY', error: 'This account is not active. Please contact the administrator.' };
    }
    return { action: 'LOGIN' };
  }
  const role = adminEmails.includes(email) ? 'ADMIN' : (rosterRole || 'STUDENT');
  return { action: 'CREATE', role };
}

module.exports = { decideSignIn, parseList };
