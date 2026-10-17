const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const StatusHistory = require('../models/StatusHistory');
const { requireAuth } = require('../middleware/auth');
const { manilaNow, manilaDate } = require('../utils/manilaTime');
const {
  shiftIso, summarizeStatuses, collapsePurposes, weekRange, bucketWeekly,
  sortYearRows, toLabelValues, countForRole, recentWeekdays, complianceStats,
} = require('../utils/analyticsHelpers');

const STAFF = ['ADMIN', 'DEAN'];
const APPOINTMENTS = Appointment.collection.name; // collection name for $lookup (avoids hard-coding "appointments")

// Student programPosition is stored as one string like "BS INFO 4D" (program + year + section).
// This regex splits it: capture 1 = program ("BS INFO"), capture 2 = year ("4"), capture 3 = section ("D").
const PROGRAM_REGEX = '^(.+?)\\s+(\\d)([A-Za-z])$';

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

        // Gender is not collected at registration. It is only recorded (optionally) when a student
        // books a consultation, so we take each student's most recent answer from their appointments.
        byGender: [
          { $match: { role: 'STUDENT' } },
          {
            $lookup: {
              from: APPOINTMENTS,
              let: { sid: '$_id' },
              pipeline: [
                { $match: { $expr: { $eq: ['$studentId', '$$sid'] }, studentGender: { $in: ['Male', 'Female'] } } },
                { $sort: { createdAt: -1 } },
                { $limit: 1 },
                { $project: { _id: 0, gender: '$studentGender' } },
              ],
              as: 'latest',
            },
          },
          { $group: { _id: { $ifNull: [{ $arrayElemAt: ['$latest.gender', 0] }, 'Not provided'] }, count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
        ],
      },
    },
  ];
}

// ── Metric 2: appointments grouped by status ────────────────────────────────
// Variants such as "CANCELLED (FACULTY ON LEAVE)" are folded into a single CANCELLED bucket.
const statusPipeline = () => [
  {
    $group: {
      _id: {
        $cond: [
          { $regexMatch: { input: { $ifNull: ['$status', ''] }, regex: '^CANCELLED' } },
          'CANCELLED',
          '$status',
        ],
      },
      count: { $sum: 1 },
    },
  },
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

// ── Metric 5 (replacement) ──────────────────────────────────────────────────
// The original spec measured QR check-ins against class schedules, but QR attendance was
// retired from this system and there is no check-in data. The closest real signal we do have is
// whether faculty post their live status: for each weekday in the last 7 days, did each active
// faculty member post at least one status update? (StatusHistory has one row per update.)
async function statusCompliance(todayIso) {
  const weekdays = recentWeekdays(todayIso, 7);
  const faculty = await User.find({ role: 'FACULTY', accountStatus: 'ACTIVE' }).select('_id').lean();
  const ids = faculty.map((f) => f._id);
  if (!ids.length || !weekdays.length) return complianceStats(0, ids.length, weekdays);

  const windowStart = manilaDate(shiftIso(todayIso, -6), '00:00');
  const rows = await StatusHistory.aggregate([
    { $match: { facultyId: { $in: ids }, timestamp: { $gte: windowStart } } },
    { $addFields: { day: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp', timezone: 'Asia/Manila' } } } },
    { $match: { day: { $in: weekdays } } },
    { $group: { _id: { facultyId: '$facultyId', day: '$day' } } }, // one row per faculty per day
    { $count: 'compliantDays' },
  ]);
  return complianceStats(rows[0] ? rows[0].compliantDays : 0, ids.length, weekdays);
}

// GET /api/analytics/overview — everything the Reports & Analytics page needs, in one request
router.get('/overview', requireAuth(STAFF), async (req, res) => {
  try {
    const today = manilaNow().dateStr;
    const range = weekRange(today, 8);

    const [demoOut, statusRows, purposeRows, utilization, weeklyRows, compliance] = await Promise.all([
      User.aggregate(demographicsPipeline()),
      Appointment.aggregate(statusPipeline()),
      Appointment.aggregate(purposePipeline()),
      User.aggregate(utilizationPipeline()),
      Appointment.aggregate([
        { $match: { date: { $gte: range.startIso, $lte: range.endIso } } },
        { $group: { _id: '$date', count: { $sum: 1 } } },
      ]),
      statusCompliance(today),
    ]);

    const facets = demoOut[0] || { roles: [], byProgram: [], byYear: [], byGender: [] };

    res.json({
      generatedAt: new Date().toISOString(),
      demographics: {
        totalStudents: countForRole(facets.roles, 'STUDENT'),
        totalFaculty: countForRole(facets.roles, 'FACULTY'),
        byProgram: toLabelValues(facets.byProgram),
        byYear: sortYearRows(facets.byYear),
        byGender: toLabelValues(facets.byGender),
      },
      statusSummary: summarizeStatuses(statusRows),
      purposes: collapsePurposes(purposeRows, 6),
      utilization,
      weekly: bucketWeekly(range, weeklyRows),
      statusCompliance: compliance,
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Could not compute analytics.' });
  }
});

module.exports = router;
