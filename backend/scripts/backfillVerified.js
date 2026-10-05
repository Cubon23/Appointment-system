// backend/scripts/backfillVerified.js
//
// ONE-TIME SCRIPT. Run this manually, once, BEFORE you deploy the new
// email-verification code to production.
//
// Why this exists:
// The User model now has `isVerified: { type: Boolean, default: false }`,
// and the login route now rejects anyone with isVerified !== true. That
// default only applies to NEW documents created from now on — it does
// NOT retroactively change rows that already exist in MongoDB Atlas.
// Every account that was registered before this script runs has no
// `isVerified` field in the database at all, which Mongoose will read
// as `undefined`, not `true` — so without this script, every existing
// user (including your own test accounts) gets locked out of login the
// moment the new code goes live.
//
// What it does:
// Finds every user document where `isVerified` is not already `true`,
// and sets it to `true`. It does NOT touch anyone who registers after
// you run it — new registrations still go through the real email
// verification flow as intended.
//
// How to run it (from the backend/ folder, with your real .env in place):
//   node scripts/backfillVerified.js
//
// It connects using the same MONGO_URI your server already uses, so it
// will update the SAME shared Atlas database your app points at. Run it
// once, check the printed count, then you're done — delete or ignore
// the file after that, it has no other purpose.

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function run() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set. Add it to backend/.env before running this script.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB Atlas.');

  const result = await User.updateMany(
    { isVerified: { $ne: true } },
    { $set: { isVerified: true } }
  );

  console.log(`Done. Matched ${result.matchedCount} existing user(s), updated ${result.modifiedCount}.`);
  console.log('These users can now log in without needing to click an email verification link.');
  console.log('Anyone who registers from now on will still go through the real verification flow.');

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error('Backfill failed:', error.message);
  process.exit(1);
});
