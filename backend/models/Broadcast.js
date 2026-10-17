const mongoose = require('mongoose');

// Executive broadcast sent by the Dean. Shown pinned on top of every
// Student / Faculty dashboard until it expires or the Dean ends it.
const BroadcastSchema = new mongoose.Schema({
  title:         { type: String, required: true, maxlength: 120 },
  message:       { type: String, required: true, maxlength: 1000 },
  audience:      { type: String, enum: ['ALL', 'STUDENT', 'FACULTY'], default: 'ALL' },
  priority:      { type: String, enum: ['URGENT', 'NOTICE'], default: 'URGENT' },
  expiresAt:     { type: Date, required: true },
  endedAt:       { type: Date, default: null },
  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: { type: String, default: '' },
}, { timestamps: true });

BroadcastSchema.index({ expiresAt: 1, endedAt: 1 });

module.exports = mongoose.model('Broadcast', BroadcastSchema);
