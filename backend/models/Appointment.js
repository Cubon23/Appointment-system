const mongoose = require('mongoose');

const AppointmentSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // older records may not have this
  studentName: { type: String, required: true },
  studentSection: { type: String, required: true },
  facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  time: { type: String, required: true },
  duration: { type: Number, default: 60 },     // consultation length in minutes
  reason: { type: String, required: true },
  status: { type: String, default: 'PENDING' }, // PENDING, APPROVED, REJECTED, COMPLETED, CANCELLED BY STUDENT / BY FACULTY, MISSED (STUDENT) / (FACULTY)
  cancelReason: { type: String, default: '' }, // why the faculty cancelled an approved consultation
  missedAt: { type: Date },                    // when it was marked MISSED (STUDENT) / MISSED (FACULTY)
  reminderSent: { type: Boolean, default: false }, // has the 1-hour-before reminder already been sent to faculty?

  // === Consultation Log fields (VAA-FM-035), filled AFTER the consultation ===
  casePresented:     { type: String },
  interventionTaken: { type: String },
  remarks:           { type: String },
  completedAt:       { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Appointment', AppointmentSchema);