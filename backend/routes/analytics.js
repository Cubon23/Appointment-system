const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const ConsultationHours = require('../models/ConsultationHours');
const AddedConsultationHours = require('../models/AddedConsultationHours');
const { buildFacultyAnalytics } = require('../utils/facultyAnalytics');
const { buildSharedReport } = require('../utils/reportMetrics');
const { requireAuth } = require('../middleware/auth');
const { manilaNow } = require('../utils/manilaTime');

const STAFF = ['ADMIN', 'DEAN'];
const APPOINTMENT_FIELDS = 'status date time studentId studentName studentSection facultyId reason appeal';

// GET /api/analytics/report — the shared Admin/Dean report, in one request.
// All numbers come from pure functions in utils/reportMetrics.js. Account health is Admin-only.
router.get('/report', requireAuth(STAFF), async (req, res) => {
  try {
    const [appointments, users, official, added] = await Promise.all([
      Appointment.find({}).select(APPOINTMENT_FIELDS).lean(),
      User.find({}).select('name email role accountStatus programPosition gender schoolId onboardingComplete').lean(),
      ConsultationHours.find({}).select('startTime endTime').lean(),
      AddedConsultationHours.find({ dayOfWeek: { $gte: 1 } }).select('startTime endTime').lean(),
    ]);
    res.json({
      generatedAt: new Date().toISOString(),
      ...buildSharedReport({
        appointments, users,
        hoursRows: [...official, ...added],
        todayIso: manilaNow().dateStr,
        includeAccountHealth: req.user.role === 'ADMIN',
      }),
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Could not compute analytics.' });
  }
});

// ── A faculty member's OWN analytics: only their appointments and hours, never anyone else's ──
router.get('/me', requireAuth(['FACULTY']), async (req, res) => {
  try {
    const facultyId = req.user.userId;
    const [appointments, official, added] = await Promise.all([
      Appointment.find({ facultyId }).select(APPOINTMENT_FIELDS).lean(),
      ConsultationHours.find({ facultyId }).lean(),
      AddedConsultationHours.find({ facultyId, dayOfWeek: { $gte: 1 } }).lean(),
    ]);
    res.json({ generatedAt: new Date().toISOString(), ...buildFacultyAnalytics({ appointments, official, added, todayIso: manilaNow().dateStr }) });
  } catch (error) {
    console.error('Faculty analytics error:', error.message);
    res.status(500).json({ error: 'Could not compute your analytics.' });
  }
});

module.exports = router;
