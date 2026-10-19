// backend/scripts/fixDoubleGmail.js
//
// ONE-TIME CLEANUP for accounts registered as "name@gmail.com@gmail.com".
// Dry run by default (only prints what it would change):
//   node scripts/fixDoubleGmail.js
// Apply the fix:
//   node scripts/fixDoubleGmail.js --apply
// Accounts whose corrected address already belongs to another account are skipped.

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function run() {
  if (!process.env.MONGO_URI) { console.error('MONGO_URI is not set in backend/.env'); process.exit(1); }
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGO_URI);

  const bad = await User.find({ email: /@gmail\.com@gmail\.com$/i });
  console.log(`Found ${bad.length} account(s) with a doubled @gmail.com.`);
  for (const u of bad) {
    const fixed = u.email.toLowerCase().replace(/(@gmail\.com)+$/, '@gmail.com');
    const clash = await User.findOne({ email: fixed, _id: { $ne: u._id } });
    if (clash) { console.log(`SKIP  ${u.email} -> ${fixed} (already used by another account)`); continue; }
    console.log(`${apply ? 'FIX ' : 'WOULD FIX'}  ${u.email} -> ${fixed}`);
    if (apply) { u.email = fixed; await u.save({ validateBeforeSave: false }); }
  }
  if (!apply && bad.length) console.log('Dry run only. Re-run with --apply to save the changes.');
  await mongoose.disconnect();
}
run().catch((e) => { console.error(e); process.exit(1); });
