const mongoose = require('mongoose');
const { isSafeLink } = require('../utils/notifyLink');

const NotificationSchema = new mongoose.Schema({
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // recipient
  type:    { type: String, required: true },   // e.g. APPOINTMENT_REQUEST, APPOINTMENT_UPDATE
  title:   { type: String, required: true },
  message: { type: String, required: true },
  read:    { type: Boolean, default: false },
  // Where clicking the message goes: a path on this app built by the server (utils/notifyLink.js), never user input.
  // The validator is a second lock: anything that is not an allowlisted path cannot be saved.
  link:    { type: String, default: null, validate: { validator: (v) => v == null || isSafeLink(v), message: 'Unsafe notification link.' } },
  // Notifications auto-delete 60 days after creation so the collection never grows forever
  createdAt: { type: Date, default: Date.now, expires: 60 * 24 * 60 * 60 },
});

NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
