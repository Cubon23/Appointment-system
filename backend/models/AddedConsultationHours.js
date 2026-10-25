const mongoose = require('mongoose');

// Extra consultation hours a faculty member adds for ONE specific date, on top of the 4 official
// weekly hours (which live in ConsultationHours and are not affected by these).
const AddedConsultationHoursSchema = new mongoose.Schema({
  facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date:      { type: String, required: true }, // "YYYY-MM-DD" (Manila)
  startTime: { type: String, required: true }, // "13:00"
  endTime:   { type: String, required: true }  // "15:00"
}, { timestamps: true });

AddedConsultationHoursSchema.index({ facultyId: 1, date: 1 });

module.exports = mongoose.model('AddedConsultationHours', AddedConsultationHoursSchema);
