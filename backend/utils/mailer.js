const nodemailer = require('nodemailer');

// Lazily builds a transporter only if real SMTP credentials are present in .env.
// Without them, sendMail() below falls back to printing the link to the server
// console instead of crashing — useful for local development/demo before the
// group has a real mailbox wired up, and safe because nothing is silently lost:
// the link is still fully functional, just delivered to the terminal instead of
// an inbox.
let transporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD
    }
  });
}

// With no SMTP credentials (and not in production) nothing is emailed. sendMail() then returns
// { preview: true } so the calling route can hand the link to the page to show in a window.
const LOCAL_PREVIEW = !transporter && process.env.NODE_ENV !== 'production';

async function sendMail({ to, subject, html }) {
  if (!transporter) {
    console.log('\n[DEV MODE: no EMAIL_USER/EMAIL_APP_PASSWORD set in .env]');
    console.log(`Would send email to: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`${html}\n`);
    return { preview: LOCAL_PREVIEW };
  }

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject,
    html
  });
  return { preview: false };
}

async function sendVerificationEmail(to, link) {
  return sendMail({
    to,
    subject: 'Verify your email address',
    html: `<p>Welcome! Please confirm this is your email address by clicking the link below.</p>
           <p><a href="${link}">${link}</a></p>
           <p>This link expires in 24 hours.</p>`
  });
}

// Sent when an Admin approves a pending account. If the person still has to confirm their email
// address, `verifyLink` carries a fresh one-time link; otherwise `loginLink` just sends them to login.
async function sendApprovedEmail(to, { verifyLink, loginLink }) {
  const next = verifyLink
    ? `<p>One last step: confirm this is your email address by clicking the link below, then you can log in.</p>
           <p><a href="${verifyLink}">${verifyLink}</a></p>
           <p>This link expires in 24 hours. If it expires, use "Resend" on the login page to get a new one.</p>`
    : `<p>You can now log in here:</p>
           <p><a href="${loginLink}">${loginLink}</a></p>`;
  return sendMail({
    to,
    subject: 'Your account has been approved',
    html: `<p>Good news — an administrator has approved your account.</p>
           ${next}`
  });
}

async function sendResetEmail(to, link) {
  return sendMail({
    to,
    subject: 'Password reset request',
    html: `<p>A password reset was requested for this account. Click below to choose a new password.</p>
           <p><a href="${link}">${link}</a></p>
           <p>This link expires in 15 minutes. If you didn't request this, you can ignore this email.</p>`
  });
}

const esc = (v) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A plain email copy of an in-app notification (approved, declined, cancelled, reminder, appeal...).
async function sendNotificationEmail(to, { title, message }) {
  const appUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();
  return sendMail({
    to,
    subject: `CCIS Sync: ${title}`,
    html: `<p><b>${esc(title)}</b></p>
           <p>${esc(message)}</p>
           <p><a href="${esc(appUrl)}">Open CCIS Sync</a></p>
           <p style="color:#888;font-size:12px">You are receiving this because it is also in your CCIS Sync notifications.</p>`
  });
}

module.exports = { sendMail, sendVerificationEmail, sendApprovedEmail, sendResetEmail, sendNotificationEmail };
