const mongoose = require('mongoose');

const ConsultationHoursSchema = new mongoose.Schema({
  facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dayOfWeek: { type: Number, required: true }, // 0=Sun ... 6=Sat
  startTime: { type: String, required: true }, // "13:00"
  endTime:   { type: String, required: true }  // "15:00"
});

module.exports = mongoose.model('ConsultationHours', ConsultationHoursSchema);