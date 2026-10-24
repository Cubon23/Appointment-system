const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const ConsultationHours = require('../models/ConsultationHours');
const { requireAuth } = require('../middleware/auth');
const { manilaNow } = require('../utils/manilaTime');
const {
  shiftIso, summarizeStatuses, collapsePurposes, weekRange, bucketWeekly,
  sortYearRows, toLabelValues, countForRole,
} = require('../utils/analyticsHelpers');
const { summarizeOutcomes, buildFacultyOutcomes, buildStudentOutcomes, mondayOfIso, addDays, buildIdleHours } = require('../utils/consultationInsights');

const STAFF = ['ADMIN', 'DEAN'];
const APPOINTMENTS = Appointment.collection.name; // collection name for $lookup (avoids hard-coding "appointments")

// Student programPosition is stored as one string like "BS INFO 4D" (program + year + section).
// This regex splits it: capture 1 = program ("BS INFO"), capture 2 = year ("4"), capture 3 = section ("D").
const PROGRAM_REGEX = '^(.+?)\\s+(\\d)([A-Za-z])$';

// Maps a user's gender to "Male"/"Female", or "Not provided" when missing (older accounts).
const GENDER_OR_NOT_PROVIDED = { $cond: [{ $in: ['$gender', ['Male', 'Female', 'Prefer not to say']] }, '$gender', 'Not provided'] };

// ── Metric 1: user demographics — ONE aggregation with $facet ───────────────
// Every facet runs over the same filtered set of users in a single database call.
function demographicsPipeline() {
  const captured = (index, fallback) => ({
    $ifNull: [{ $arrayElemAt: ['$parsed.captures', index] }, fallback],
  });

  return [
    { $match: { role: { $in: ['STUDENT', 'FACULTY'] }, accountStatus: 'ACTIVE' } },
    {
      $facet: {
        roles: [{ $group: { _id: '$role', count: { $sum: 1 } } }],

        byProgram: [
          { $match: { role: 'STUDENT' } },
          { $addFields: { parsed: { $regexFind: { input: '$programPosition', regex: PROGRAM_REGEX } } } },
          { $group: { _id: captured(0, 'Unspecified'), count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
        ],

        byYear: [
          { $match: { role: 'STUDENT' } },
          { $addFields: { parsed: { $regexFind: { input: '$programPosition', regex: PROGRAM_REGEX } } } },
          { $group: { _id: captured(1, 'Unspecified'), count: { $sum: 1 } } },
        ],

        // Gender comes from registration (User.gender). Accounts created before it was collected
        // have none and are counted as "Not provided".
        byGender: [
          { $match: { role: 'STUDENT' } },
          { $group: { _id: GENDER_OR_NOT_PROVIDED, count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
        ],

        byFacultyGender: [
          { $match: { role: 'FACULTY' } },
          { $group: { _id: GENDER_OR_NOT_PROVIDED, count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
        ],
      },
    },
  ];
}

// ── Metric 2: appointments grouped by their exact status ────────────────────
// summarizeStatuses() folds the CANCELLED*/MISSED* variants for the bar chart, and
// summarizeOutcomes() keeps them apart (by student / by faculty / on leave) for the outcomes panel.
const statusPipeline = () => [
  { $group: { _id: '$status', count: { $sum: 1 } } },
];

// ── Metric 3: consultation purposes, with each one's share of the total ─────
// The purpose is free text, so it is trimmed and lower-cased first ("Capstone " = "capstone").
const purposePipeline = () => [
  { $match: { reason: { $type: 'string' } } },
  { $addFields: { purpose: { $toLower: { $trim: { input: '$reason' } } } } },
  { $match: { purpose: { $ne: '' } } },
  { $group: { _id: '$purpose', count: { $sum: 1 } } },
  { $sort: { count: -1, _id: 1 } },
  { $group: { _id: null, total: { $sum: '$count' }, items: { $push: { purpose: '$_id', count: '$count' } } } },
  { $unwind: '$items' },
  {
    $project: {
      _id: 0,
      purpose: '$items.purpose',
      count: '$items.count',
      percent: { $round: [{ $multiply: [{ $divide: ['$items.count', '$total'] }, 100] }, 1] },
    },
  },
  { $sort: { count: -1, purpose: 1 } },
];

// ── Metric 4: faculty utilization leaderboard ───────────────────────────────
// Starts from the faculty list and $lookups each one's appointment counts, so faculty with
// zero completed consultations still appear at the bottom (the "underutilized" end).
const utilizationPipeline = () => [
  { $match: { role: 'FACULTY', accountStatus: 'ACTIVE' } },
  {
    $lookup: {
      from: APPOINTMENTS,
      let: { fid: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$facultyId', '$$fid'] } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
          },
        },
      ],
      as: 'stats',
    },
  },
  {
    $project: {
      _id: 0,
      facultyId: '$_id',
      name: 1,
      programPosition: 1,
      completed: { $ifNull: [{ $arrayElemAt: ['$stats.completed', 0] }, 0] },
      total: { $ifNull: [{ $arrayElemAt: ['$stats.total', 0] }, 0] },
    },
  },
  { $sort: { completed: -1, total: -1, name: 1 } },
];


// GET /api/analytics/overview — everything the Reports & Analytics page needs, in one request
router.get('/overview', requireAuth(STAFF), async (req, res) => {
  try {
    const today = manilaNow().dateStr;
    const range = weekRange(today, 8);

    const [demoOut, statusRows, purposeRows, utilization, weeklyRows, missedWeeklyRows, facultyOutcomeRows, activeFaculty, studentOutcomeRows] = await Promise.all([
      User.aggregate(demographicsPipeline()),
      Appointment.aggregate(statusPipeline()),
      Appointment.aggregate(purposePipeline()),
      User.aggregate(utilizationPipeline()),
      Appointment.aggregate([
        { $match: { date: { $gte: range.startIso, $lte: range.endIso } } },
        { $group: { _id: '$date', count: { $sum: 1 } } },
      ]),
      Appointment.aggregate([
        { $match: { status: { $regex: '^MISSED' }, date: { $gte: range.startIso, $lte: range.endIso } } },
        { $group: { _id: '$date', count: { $sum: 1 } } },
      ]),
      Appointment.aggregate([{ $group: { _id: { f: '$facultyId', s: '$status' }, count: { $sum: 1 } } }]),
      User.find({ role: 'FACULTY', accountStatus: 'ACTIVE' }).select('name').lean(),
      // Per student: studentId (older records fall back to the name) + status. name/section only label the row.
      Appointment.aggregate([{
        $group: {
          _id: { s: { $ifNull: ['$studentId', '$studentName'] }, st: '$status' },
          name: { $last: '$studentName' }, section: { $last: '$studentSection' }, count: { $sum: 1 },
        },
      }]),
    ]);

    const facets = demoOut[0] || { roles: [], byProgram: [], byYear: [], byGender: [], byFacultyGender: [] };

    res.json({
      generatedAt: new Date().toISOString(),
      demographics: {
        totalStudents: countForRole(facets.roles, 'STUDENT'),
        totalFaculty: countForRole(facets.roles, 'FACULTY'),
        byProgram: toLabelValues(facets.byProgram),
        byYear: sortYearRows(facets.byYear),
        byGender: toLabelValues(facets.byGender),
        byFacultyGender: toLabelValues(facets.byFacultyGender),
      },
      statusSummary: summarizeStatuses(statusRows),
      purposes: collapsePurposes(purposeRows, 6),
      utilization,
      weekly: bucketWeekly(range, weeklyRows),
      outcomes: summarizeOutcomes(statusRows),
      weeklyMissed: bucketWeekly(range, missedWeeklyRows),
      facultyOutcomes: buildFacultyOutcomes(facultyOutcomeRows, activeFaculty),
      studentOutcomes: buildStudentOutcomes(studentOutcomeRows),
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Could not compute analytics.' });
  }
});

// GET /api/analytics/idle-hours?week=YYYY-MM-DD — per-faculty consultation-hour blocks of one
// Monday–Sunday week and whether any appointment was requested inside each block.
router.get('/idle-hours', requireAuth(STAFF), async (req, res) => {
  try {
    const now = manilaNow();
    const wanted = /^\d{4}-\d{2}-\d{2}$/.test(req.query.week || '') ? req.query.week : now.dateStr;
    const weekStart = mondayOfIso(wanted);
    const weekEnd = addDays(weekStart, 6);

    const [faculty, hours, appointments] = await Promise.all([
      User.find({ role: 'FACULTY', accountStatus: 'ACTIVE' }).select('name').lean(),
      ConsultationHours.find({}).select('facultyId dayOfWeek startTime endTime').lean(),
      Appointment.find({ date: { $gte: weekStart, $lte: weekEnd } }).select('facultyId date time').lean(),
    ]);

    res.json(buildIdleHours({ faculty, hours, appointments, weekStart, today: now.dateStr, nowHHMM: now.hhmm }));
  } catch (error) {
    console.error('Idle-hours error:', error);
    res.status(500).json({ error: 'Could not compute idle consultation hours.' });
  }
});

module.exports = router;
