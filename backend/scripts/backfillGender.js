// ONE-TIME, OPTIONAL: gender used to be asked on every appointment. It is now collected at
// registration (User.gender). This copies each student's most recent answer from their old
// appointments onto their account, so that data isn't lost when the appointment field goes away.
//
// Safe to re-run: it only fills accounts that have no gender yet, and never overwrites one.
// Run from the backend folder:   node scripts/backfillGender.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    // Read the raw collection: the studentGender field has been removed from the Appointment
    // schema, so the Appointment model would no longer return it.
    const rows = await mongoose.connection
      .collection('appointments')
      .aggregate([
        { $match: { studentId: { $ne: null }, studentGender: { $in: ['Male', 'Female'] } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$studentId', gender: { $first: '$studentGender' } } },
      ])
      .toArray();

    let updated = 0;
    for (const row of rows) {
      const result = await User.updateOne(
        { _id: row._id, role: 'STUDENT', $or: [{ gender: { $exists: false } }, { gender: null }] },
        { $set: { gender: row.gender } }
      );
      updated += result.modifiedCount;
    }

    console.log(`Found gender on appointments for ${rows.length} student(s); copied it onto ${updated} account(s).`);
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
