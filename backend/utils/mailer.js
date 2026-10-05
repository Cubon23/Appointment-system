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

async function sendMail({ to, subject, html }) {
  if (!transporter) {
    console.log('\n[DEV MODE: no EMAIL_USER/EMAIL_APP_PASSWORD set in .env]');
    console.log(`Would send email to: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`${html}\n`);
    return;
  }

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject,
    html
  });
}

async function sendVerificationEmail(to, link) {
  await sendMail({
    to,
    subject: 'Verify your email address',
    html: `<p>Welcome! Please confirm this is your email address by clicking the link below.</p>
           <p><a href="${link}">${link}</a></p>
           <p>This link expires in 24 hours.</p>`
  });
}

async function sendResetEmail(to, link) {
  await sendMail({
    to,
    subject: 'Password reset request',
    html: `<p>A password reset was requested for this account. Click below to choose a new password.</p>
           <p><a href="${link}">${link}</a></p>
           <p>This link expires in 15 minutes. If you didn't request this, you can ignore this email.</p>`
  });
}

module.exports = { sendMail, sendVerificationEmail, sendResetEmail };
