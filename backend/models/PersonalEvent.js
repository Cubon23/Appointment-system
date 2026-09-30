const mongoose = require('mongoose');

const PersonalEventSchema = new mongoose.Schema({
  facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },   // e.g. "Faculty Meeting", "Out of Office"
  dayOfWeek: { type: Number, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  note: { type: String } // optional extra detail
});

module.exports = mongoose.model('PersonalEvent', PersonalEventSchema);