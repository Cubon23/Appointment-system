const mongoose = require('mongoose');

// One-off, date-specific private note on a faculty member's calendar.
// (Replaces the old weekly-recurring PersonalEvent for notes.)
const CalendarNoteSchema = new mongoose.Schema({
  facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date:      { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // 'YYYY-MM-DD' (plain string, avoids timezone shifts)
  startTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ },       // 'HH:MM'
  endTime:   { type: String, required: true, match: /^\d{2}:\d{2}$/ },
  text:      { type: String, required: true, trim: true, maxlength: 500 },
}, { timestamps: true });

CalendarNoteSchema.index({ facultyId: 1, date: 1 });

module.exports = mongoose.model('CalendarNote', CalendarNoteSchema);
