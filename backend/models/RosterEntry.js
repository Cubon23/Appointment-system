const mongoose = require('mongoose');

// The Admin's roster of school accounts that may hold a privileged role.
// Anyone with a school Google account who is NOT on this list signs in as a STUDENT.
const RosterEntrySchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  role: { type: String, enum: ['FACULTY', 'DEAN', 'ADMIN'], required: true },
}, { timestamps: true });

module.exports = mongoose.model('RosterEntry', RosterEntrySchema);
