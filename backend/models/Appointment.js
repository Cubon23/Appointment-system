const mongoose = require('mongoose');

const AppointmentSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // older records may not have this
  studentName: { type: String, required: true },
  studentSection: { type: String, required: true },
  studentGender: { type: String, enum: ['Male', 'Female', ''], default: '' }, // optional — older records won't have this
  facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  time: { type: String, required: true },
  reason: { type: String, required: true },
  status: { type: String, default: 'PENDING' }, // PENDING, APPROVED, REJECTED, COMPLETED
  reminderSent: { type: Boolean, default: false }, // has the 1-hour-before reminder already been sent to faculty?

  // === Consultation Log fields (VAA-FM-035), filled AFTER the consultation ===
  casePresented:     { type: String },
  interventionTaken: { type: String },
  remarks:           { type: String },
  completedAt:       { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Appointment', AppointmentSchema);