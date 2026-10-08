const bcrypt = require('bcryptjs');
const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const router = express.Router();

// Blocks repeated password-guessing: after 10 failed/attempted logins from the
// same IP within 15 minutes, further attempts are rejected until the window resets.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Same protection for the forgot-password request itself, so it can't be used
// to spam a mailbox with reset links or to probe which emails are registered.
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many password reset requests. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

const { sendVerificationEmail, sendResetEmail } = require('../utils/mailer');
const User = require('../models/User'); 
const Schedule = require('../models/Schedule');
const Appointment = require('../models/Appointment');
const Announcement = require('../models/Announcement');
const CalendarNote = require('../models/CalendarNote');
const Notification = require('../models/Notification');
const { notify, notifyRole, resolveStudentId, fmtDate, fmtTime } = require('../utils/notify');
const StatusHistory = require('../models/StatusHistory');
const crypto = require('crypto'); // Built-in Node.js module for secure hashes
const ConsultationHours = require('../models/ConsultationHours');
const { isOverlapping } = require('../utils/timeMath');
const { requireAuth } = require('../middleware/auth');

// ---- Access control helpers ------------------------------------------------
const ALL_ROLES = ['STUDENT', 'FACULTY', 'DEAN', 'ADMIN'];
const STAFF = ['ADMIN', 'DEAN'];
const isStaff = (req) => STAFF.includes(req.user.role);
// The logged-in user must BE the faculty/user named by the URL param (staff bypass optional)
const ownerOnly = (getId) => (req, res, next) =>
  String(getId(req)) === String(req.user.userId) ? next() : res.status(403).json({ error: 'Forbidden' });
const ownerOrStaff = (getId) => (req, res, next) =>
  isStaff(req) || String(getId(req)) === String(req.user.userId) ? next() : res.status(403).json({ error: 'Forbidden' });
const timeToMinutes = (time) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

// =========================================================================
// === ROUTES ===
// =========================================================================

// === 1. SECURE REGISTRATION ROUTE (With Bcrypt) ===
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, programPosition, schoolId, facultyId } = req.body;

    // Originally this required @ua.edu.ph specifically. The school never actually
    // provisioned working mailboxes on that domain, so verification emails sent to
    // it silently went nowhere and nobody could complete registration. Per guidance
    // from the school's own network administrator, this now requires @gmail.com
    // specifically — not just any email — because mailer.js sends through Gmail SMTP,
    // and a Gmail recipient is the one case we can be confident is actually
    // deliverable (so the verify-email and forgot-password links reliably arrive).
    // Identity itself is still established by Admin's manual ID verification
    // (PENDING_APPROVAL -> Verification Queue), not by the email domain.
    if (!email || !email.toLowerCase().endsWith('@gmail.com')) {
      return res.status(400).json({ error: 'Please register with a Gmail address (e.g. yourname@gmail.com).' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    if (role === 'ADMIN' || role === 'DEAN') {
      return res.status(403).json({ error: 'Restricted role. Contact IT department.' });
    }
    
    // Password Strength Validation
    const passwordPattern = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;
    if (!passwordPattern.test(password)) {
      return res.status(400).json({ error: 'Password must be at least 12 characters, with 1 uppercase letter, 1 number, and 1 symbol.' });
    }

    // Hash the password before saving/bcrypting it to the database
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // A user-typed schoolId/facultyId at registration is just a claim, not proof — it must
    // still be checked and assigned by Admin via the Verification Queue (PATCH /users/:id/verify).
    // Only accounts that need no ID (e.g. none required for this role) skip straight to ACTIVE.
    const accountStatus = (role === 'STUDENT' || role === 'FACULTY') ? 'PENDING_APPROVAL' : 'ACTIVE';

    // Email verification: generate a one-time token, store only its hash (same
    // principle as the password itself — if the database ever leaked, a stored
    // raw token would let anyone verify/hijack any pending account).
    const rawVerificationToken = crypto.randomBytes(32).toString('hex');
    const hashedVerificationToken = crypto.createHash('sha256').update(rawVerificationToken).digest('hex');

    const newUser = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword, // Secured.
      role,
      programPosition,
      schoolId,
      facultyId,
      accountStatus,
      currentStatus: 'OUT_OF_OFFICE',
      isVerified: false,
      verificationToken: hashedVerificationToken,
      verificationTokenExpires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    });

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();
    const verificationLink = `${frontendUrl}/verify-email/${rawVerificationToken}`;
    await sendVerificationEmail(newUser.email, verificationLink);

    if (accountStatus === 'PENDING_APPROVAL') {
      await notifyRole('ADMIN', {
        type: 'REGISTRATION',
        title: 'New registration awaiting verification',
        message: `${name} (${role}) registered and needs an ID assigned in the Verification Queue.`,
      });
    }

    res.json({
      message: 'Registration received! Please check your email to verify your account before logging in.',
      accountStatus
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// === 2. SECURE LOGIN ROUTE ===
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Find the user
    const user = await User.findOne({ email: email.toLowerCase() });

    // console.log("DIAGNOSTIC - User found:", user ? "YES" : "NO", "| Email searched:", email.toLowerCase());
    
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // 2. Check the Status State Machine BEFORE checking the password
    if (user.accountStatus === 'PENDING_APPROVAL') {
      return res.status(403).json({ error: 'Access Denied: Your faculty account is still pending Admin verification.' });
    }
    if (user.accountStatus === 'ARCHIVED' || user.accountStatus === 'RESTRICTED') {
      return res.status(403).json({ error: 'Access Denied: Your account has been restricted or archived.' });
    }
    if (!user.isVerified) {
      return res.status(403).json({ error: 'Please verify your email address before logging in. Check your inbox for the verification link.' });
    }

    // 3. Cryptographically verify the password (Declared only ONCE)
    const isMatch = await bcrypt.compare(password, user.password);
    // console.log("DIAGNOSTIC - Password Match:", isMatch);
    
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // 4. Send back the user data (Do NOT send the hashed password back to the frontend)
    const token = jwt.sign(
     { userId: user._id, role: user.role }, 
     process.env.JWT_SECRET, 
     { expiresIn: '8h' }
   );
   res.json({
    token,
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    programPosition: user.programPosition
});

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// 1. GET ROUTE: Fetch all faculty members for the dashboard
router.get('/status', requireAuth(ALL_ROLES), async (req, res) => {
  try {
    const facultyList = await User.find({ role: 'FACULTY' })
      .select('name programPosition currentStatus currentLocation room statusUpdatedAt statusNote')
      .sort({ name: 1 });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const enriched = facultyList.map(f => {
      const obj = f.toObject();
      const lastUpdate = f.statusUpdatedAt ? new Date(f.statusUpdatedAt) : null;
      const updatedToday = lastUpdate && lastUpdate >= today;
      
      if (!updatedToday) {
        obj.currentStatus = 'NOT_UPDATED';
      }
      return obj;
    });

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching faculty status' });
  }
});

// PUT ROUTE: Approve or Reject an Appointment
router.put('/appointment/:id', requireAuth(ALL_ROLES), async (req, res) => {
  try {
    const { status } = req.body;
    
    // Replace with your actual Appointment model reference if imported differently
    const targetApt = await Appointment.findById(req.params.id);

    if (!targetApt) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    // Who may change this appointment, and to what
    if (req.user.role === 'FACULTY' && String(targetApt.facultyId) !== String(req.user.userId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (req.user.role === 'STUDENT') {
      const me = await User.findById(req.user.userId).select('name');
      if (!me || me.name !== targetApt.studentName || status !== 'CANCELLED BY STUDENT') {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    // THE INTERCEPTOR: Only run overlap logic if they are trying to APPROVE
    if (status === 'APPROVED') {
      const facultyId = targetApt.facultyId;
      const aptDate = new Date(targetApt.date);
      
      // Get day of week (0 = Sunday, 1 = Monday) to check against recurring classes
      const dayOfWeek = aptDate.getDay(); 

            const facultyHours = await ConsultationHours.find({ facultyId, dayOfWeek });
      const withinHours = facultyHours.some(h => 
        timeToMinutes(targetApt.time) >= timeToMinutes(h.startTime) && timeToMinutes(targetApt.time) < timeToMinutes(h.endTime)
      );
      if (!withinHours) {
        return res.status(400).json({ error: 'This time is outside the faculty member\'s consultation hours.' });
      }

      // 1b. Fetch faculty's immovable teaching schedule for this day
      const dayClasses = await Schedule.find({ facultyId, dayOfWeek });

      // 2. Fetch faculty's ALREADY APPROVED appointments for this exact date
      const approvedAppointments = await Appointment.find({
        facultyId: facultyId,
        date: targetApt.date,
        status: 'APPROVED',
        _id: { $ne: targetApt._id }
      });

      // Pool all physical commitments together
      const allExistingEvents = [...dayClasses, ...approvedAppointments];

      // 3. RUN THE HEURISTIC
      if (isOverlapping(targetApt.time, allExistingEvents)) {
        return res.status(409).json({ 
          error: 'Double-Booking Prevented: This time block conflicts with an existing class or approved appointment.' 
        });
      }
    }

    // If math clears (or if they are just rejecting/canceling), execute the database write
    const previousStatus = targetApt.status;
    targetApt.status = status;
    await targetApt.save();

    if (status !== previousStatus) {
      const when = `${fmtDate(targetApt.date)} at ${fmtTime(targetApt.time)}`;
      if (req.user.role === 'STUDENT') {
        await notify(targetApt.facultyId, {
          type: 'APPOINTMENT_UPDATE',
          title: 'Consultation cancelled by student',
          message: `${targetApt.studentName} cancelled the consultation on ${when}.`,
        });
      } else {
        const faculty = await User.findById(targetApt.facultyId).select('name');
        const verb = status === 'APPROVED' ? 'approved' : status === 'REJECTED' ? 'declined' : `updated to ${status}`;
        await notify(await resolveStudentId(targetApt), {
          type: 'APPOINTMENT_UPDATE',
          title: `Consultation ${verb}`,
          message: `Your request with ${faculty ? faculty.name : 'your instructor'} on ${when} was ${verb}.`,
        });
      }
    }

    res.json(targetApt);

  } catch (error) {
    console.error('Appointment Collision Check Error:', error);
    res.status(500).json({ error: 'Server error processing appointment interval math.' });
  }
});

// 3. GET ROUTE: Fetch schedule for a specific faculty member
router.get('/my-schedule/:facultyId', requireAuth(ALL_ROLES), async (req, res) => {
  try {
    const schedules = await Schedule.find({ facultyId: req.params.facultyId })
      .sort({ dayOfWeek: 1, startTime: 1 });
    res.json(schedules);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching schedule.' });
  }
});

// 4. POST ROUTE: Admin assigns a schedule to a faculty member
router.post('/schedule/add', requireAuth(STAFF), async (req, res) => {
  const { facultyId, subject, room, dayOfWeek, startTime, endTime } = req.body;
  try {
    await Schedule.create({ facultyId, subject, room, dayOfWeek, startTime, endTime });
    await notify(facultyId, {
      type: 'SCHEDULE_ASSIGNED',
      title: 'New class added to your schedule',
      message: `${subject} in ${room}, ${fmtTime(startTime)} - ${fmtTime(endTime)}.`,
    });
    res.json({ message: 'Schedule assigned successfully!' });
  } catch (error) {
    res.status(500).json({ error: 'Server error assigning schedule.' });
  }
});

// 5. POST ROUTE: Admin adds a new faculty member (QR Generation)
router.post('/add', requireAuth(STAFF), async (req, res) => {
  const { name, email, programPosition, room, role, schoolId, facultyId } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const newUser = new User({
      name,
      email,
      programPosition,
      room,
      role: role || 'FACULTY',
      schoolId,
      facultyId,
      currentStatus: 'OUT_OF_OFFICE',
    });

    await newUser.save();
    res.json({ message: 'Account provisioned successfully', facultyName: name });
  } catch (error) {
    res.status(500).json({ error: 'Error provisioning account' });
  }
});

// 7. GET ROUTE: Fetch announcements by section
router.get('/announcements/:section', requireAuth(ALL_ROLES), async (req, res) => {
  try {
    const announcements = await Announcement.find({
      $or: [{ section: req.params.section }, { section: 'ALL' }]
    }).sort({ datePosted: -1 });
    res.json(announcements);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching announcements' });
  }
});

// 8. POST ROUTE: Student requests an appointment
router.post('/appointment', requireAuth(['STUDENT']), async (req, res) => {
  try {
    const { facultyId, date, time, studentName, studentSection, reason } = req.body;
    
    const studentId = req.user.userId; // from the verified login token, not the request body

    const aptDate = new Date(date);
    const dayOfWeek = aptDate.getDay(); 
    const requestedMinutes = timeToMinutes(time); 

    // 0. Block booking dates/times that have already passed
    const [aptHour, aptMinute] = time.split(':').map(Number);
    const requestedDateTime = new Date(date);
    requestedDateTime.setHours(aptHour, aptMinute, 0, 0);

    if (requestedDateTime < new Date()) {
      return res.status(400).json({ 
        error: 'Booking Denied: You cannot schedule an appointment in the past.' 
      });
    }

    // Upstream Operating Hours Constraint: 7:30 AM (450 mins) to 4:00 PM (960 mins)
    if (requestedMinutes < 450 || requestedMinutes > 960) {
      return res.status(400).json({ 
        error: `Booking Denied: Consultations are restricted to official operating hours (7:30 AM to 4:00 PM).` 
      });
    }

        // Must fall inside the faculty member's declared consultation hours
    const facultyHours = await ConsultationHours.find({ facultyId, dayOfWeek });
    const withinHours = facultyHours.some(h =>
      requestedMinutes >= timeToMinutes(h.startTime) && requestedMinutes < timeToMinutes(h.endTime)
    );
    if (!withinHours) {
      return res.status(400).json({ error: 'This time is outside the faculty member\'s consultation hours.' });
    }
    // 1. Fetch the professor's immovable academic classes for this day
    const dayClasses = await Schedule.find({ 
      facultyId: facultyId, 
      dayOfWeek: dayOfWeek 
    });

    // 2. Fetch the professor's ALREADY APPROVED appointments for this date
    const approvedAppointments = await Appointment.find({
      facultyId: facultyId,
      date: date,
      status: 'APPROVED'
    });

    const allExistingEvents = [...dayClasses, ...approvedAppointments];

    // 3. THE INTERCEPTOR: Run the interval overlap math
    if (isOverlapping(time, allExistingEvents)) {
      return res.status(400).json({ 
        error: 'Booking Denied: The instructor is teaching a class or has an approved appointment at this time.' 
      });
    }

    // 4. Anti-Spam Protocol
    const existingPending = await Appointment.findOne({
      facultyId, date, time, studentName, status: 'PENDING'
    });
    
    if (existingPending) {
      return res.status(400).json({ 
        error: `Anti-Spam: You already have a pending request submitted for this exact time.` 
      });
    }

    // 5. Save the pending request
    const newAppointment = await Appointment.create({
      facultyId,
      studentId,
      studentName,
      studentSection,
      date,
      time,
      reason,
      status: 'PENDING'
    });

    await notify(facultyId, {
      type: 'APPOINTMENT_REQUEST',
      title: 'New consultation request',
      message: `${studentName} (${studentSection}) requested ${fmtDate(date)} at ${fmtTime(time)}. Reason: ${String(reason).slice(0, 100)}`,
    });

    res.json({ message: 'Appointment requested successfully!', appointment: newAppointment });

  } catch (error) {
    console.error('Student Booking Error:', error);
    res.status(500).json({ error: 'Server error processing the appointment request.' });
  }
});

// 9. GET ROUTE: Admin fetches ALL appointments
router.get('/appointments/all', requireAuth(STAFF), async (req, res) => {
  try {
    const appointments = await Appointment.find().populate('facultyId', 'name').sort({ createdAt: -1 });
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching all appointments' });
  }
});

// 10. GET ROUTE: Fetch all unverified users
router.get('/users/all', requireAuth(STAFF), async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: 'ADMIN' } })
  .select('-password')
  .sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching users' });
  }
});

// Verify a pending user by assigning their official ID
router.patch('/users/:id/verify', requireAuth(STAFF), async (req, res) => {
  try {
    const { idValue } = req.body; // the School ID or Faculty ID being assigned
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.role === 'STUDENT') {
      user.schoolId = idValue;
    } else if (user.role === 'FACULTY') {
      user.facultyId = idValue;
    } else {
      return res.status(400).json({ error: 'This role cannot be verified this way.' });
    }

    user.accountStatus = 'ACTIVE';
    await user.save(); // triggers your existing schema validation (format check) automatically

    res.json({ message: `${user.name} has been verified.`, user });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Verification failed.' });
  }
});

// 12. GET ROUTE: Fetch appointments for one specific faculty member
router.get('/appointments/me/:facultyId', requireAuth(['FACULTY','ADMIN','DEAN']), ownerOrStaff(r => r.params.facultyId), async (req, res) => {
  try {
    const appointments = await Appointment.find({ facultyId: req.params.facultyId }).sort({ createdAt: -1 });
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching my appointments' });
  }
});

// 13. PUT ROUTE: Save a Notice
// 13b. PUT ROUTE: Faculty updates their own live status/location (used by FacultyDashboard's status page)
const VALID_STATUSES = ['AVAILABLE', 'IN_CLASS', 'IN_MEETING', 'ON_BREAK', 'OUT_OF_OFFICE', 'ON_LEAVE', 'ABSENT', 'NOT_UPDATED'];
router.put('/update-status/:id', requireAuth(['FACULTY']), ownerOnly(r => r.params.id), async (req, res) => {
  try {
    const { currentStatus, currentLocation } = req.body;
    if (!VALID_STATUSES.includes(currentStatus)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const updated = await User.findByIdAndUpdate(
      req.params.id,
      { currentStatus, currentLocation, statusUpdatedAt: new Date() },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Faculty not found' });
    }

    await StatusHistory.create({
      facultyId: req.params.id,
      status: currentStatus,
      note: currentLocation || '',
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Error updating status' });
  }
});

router.put('/notice/:id', requireAuth(['FACULTY']), ownerOnly(r => r.params.id), async (req, res) => {
  try {
    const updated = await User.findByIdAndUpdate(req.params.id, { noticeMessage: req.body.notice }, { new: true });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: 'Error saving notice' }); }
});

// 14. PUT ROUTE: Save a Future Flag Date & AUTO-CANCEL Appointments on that date
router.put('/flag-date/:id', requireAuth(['FACULTY']), ownerOnly(r => r.params.id), async (req, res) => {
  try {
    const { flagDate, reason } = req.body;
    
    const updated = await User.findByIdAndUpdate(
      req.params.id, 
      { flaggedDate: flagDate, flaggedReason: reason }, 
      { new: true }
    );

    const affected = await Appointment.find({
      facultyId: req.params.id,
      date: flagDate,
      status: { $in: ['PENDING', 'APPROVED'] }
    });

    await Appointment.updateMany(
      { 
        facultyId: req.params.id, 
        date: flagDate, 
        status: { $in: ['PENDING', 'APPROVED'] } 
      },
      { 
        $set: { 
          status: 'CANCELLED (FACULTY ON LEAVE)',
          reason: 'System Auto-Cancel: Faculty declared emergency leave.'
        } 
      }
    );

    for (const apt of affected) {
      await notify(await resolveStudentId(apt), {
        type: 'LEAVE_CANCELLATION',
        title: 'Consultation cancelled (faculty on leave)',
        message: `Your consultation on ${fmtDate(apt.date)} at ${fmtTime(apt.time)} was cancelled because ${updated ? updated.name : 'the instructor'} declared leave.`,
      });
    }
    await notifyRole('DEAN', {
      type: 'FACULTY_LEAVE',
      title: 'Faculty leave declared',
      message: `${updated ? updated.name : 'A faculty member'} declared leave on ${fmtDate(flagDate)}. ${affected.length} appointment(s) were auto-cancelled.`,
    });

    res.json(updated);
  } catch (err) { res.status(500).json({ error: 'Error saving flag date' }); }
});

// 15. GET ROUTE: Fetch appointments for one specific student
// NOTE: previously matched by studentName (string), which meant two students sharing the
// same name could see each other's appointments. Now scoped to the actual account's ID.
router.get('/appointments/student/:studentId', requireAuth(['STUDENT','ADMIN','DEAN']), ownerOrStaff(r => r.params.studentId), async (req, res) => {
  try {
    const appointments = await Appointment.find({ studentId: req.params.studentId })
      .populate('facultyId', 'name')
      .sort({ createdAt: -1 });
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching student appointments' });
  }
});

// Faculty sets/updates their consultation hours
// const timeToMinutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

router.post('/consultation-hours', requireAuth(['FACULTY']), async (req, res) => {
  try {
    const { hours } = req.body; // [{ dayOfWeek, startTime, endTime }, ...]
    const facultyId = req.user.userId; // always the logged-in faculty, never trust the body

    // 1. Total must be exactly 4 hours (240 minutes)
    const totalMinutes = hours.reduce((sum, h) => sum + (timeToMinutes(h.endTime) - timeToMinutes(h.startTime)), 0);
    if (totalMinutes !== 240) {
      return res.status(400).json({ error: `Consultation hours must total exactly 4 hours per week. Currently: ${(totalMinutes / 60).toFixed(1)} hours.` });
    }

    // 2. None of these blocks may overlap the faculty's own teaching schedule
    const teachingSchedule = await Schedule.find({ facultyId });
    for (const block of hours) {
      const conflict = teachingSchedule.some(cls => 
        cls.dayOfWeek === block.dayOfWeek &&
        timeToMinutes(block.startTime) < timeToMinutes(cls.endTime) &&
        timeToMinutes(cls.startTime) < timeToMinutes(block.endTime)
      );
      if (conflict) {
        return res.status(400).json({ error: `Consultation block on day ${block.dayOfWeek} overlaps your teaching schedule.` });
      }
    }

    await ConsultationHours.deleteMany({ facultyId });
    const created = await ConsultationHours.insertMany(hours.map(h => ({ ...h, facultyId })));
    res.json({ message: 'Consultation hours saved.', hours: created });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// =========================================================================
// === CALENDAR NOTES (private, one-off, date-specific) ====================
// =========================================================================
// Body: { date: 'YYYY-MM-DD', startTime: 'HH:MM', endTime: 'HH:MM', text }
// Notes may not overlap that weekday's fixed teaching blocks or consultation hours.
const validateNote = async (facultyId, { date, startTime, endTime, text }) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || isNaN(new Date(date + 'T00:00:00Z')))
    return 'A valid date (YYYY-MM-DD) is required.';
  if (!/^\d{2}:\d{2}$/.test(startTime || '') || !/^\d{2}:\d{2}$/.test(endTime || ''))
    return 'Start and end time (HH:MM) are required.';
  if (timeToMinutes(endTime) <= timeToMinutes(startTime))
    return 'End time must be after start time.';
  if (!text || !String(text).trim()) return 'Note text is required.';
  if (String(text).length > 500) return 'Note must be 500 characters or fewer.';

  // Weekday of the specific date, timezone-safe. 1=Mon ... 6=Sat (matches Schedule/ConsultationHours); Sunday=0 matches nothing.
  const dayOfWeek = new Date(date + 'T00:00:00Z').getUTCDay();
  const fixed = [
    ...(await Schedule.find({ facultyId, dayOfWeek })),
    ...(await ConsultationHours.find({ facultyId, dayOfWeek })),
  ];
  const conflict = fixed.some(b =>
    timeToMinutes(startTime) < timeToMinutes(b.endTime) &&
    timeToMinutes(b.startTime) < timeToMinutes(endTime)
  );
  return conflict ? 'This time overlaps a class or consultation hours block.' : null;
};

// List all notes for a faculty member
router.get('/notes/:facultyId', requireAuth(['FACULTY']), ownerOnly(r => r.params.facultyId), async (req, res) => {
  try {
    const notes = await CalendarNote.find({ facultyId: req.params.facultyId }).sort({ date: 1, startTime: 1 });
    res.json(notes);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching notes.' });
  }
});

// Create a note
router.post('/notes/:facultyId', requireAuth(['FACULTY']), ownerOnly(r => r.params.facultyId), async (req, res) => {
  try {
    const { facultyId } = req.params;
    const { date, startTime, endTime, text } = req.body;
    const problem = await validateNote(facultyId, { date, startTime, endTime, text });
    if (problem) return res.status(400).json({ error: problem });

    const note = await CalendarNote.create({ facultyId, date, startTime, endTime, text: String(text).trim() });
    res.json({ message: 'Note added.', note });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Edit a note (:id is the NOTE id here)
router.put('/notes/:id', requireAuth(['FACULTY']), async (req, res) => {
  try {
    const note = await CalendarNote.findOne({ _id: req.params.id, facultyId: req.user.userId });
    if (!note) return res.status(404).json({ error: 'Note not found.' });

    const { date, startTime, endTime, text } = req.body;
    const problem = await validateNote(note.facultyId, { date, startTime, endTime, text });
    if (problem) return res.status(400).json({ error: problem });

    Object.assign(note, { date, startTime, endTime, text: String(text).trim() });
    await note.save();
    res.json({ message: 'Note updated.', note });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete a note (:id is the NOTE id)
router.delete('/notes/:id', requireAuth(['FACULTY']), async (req, res) => {
  try {
    await CalendarNote.findOneAndDelete({ _id: req.params.id, facultyId: req.user.userId });
    res.json({ message: 'Note removed.' });
  } catch (error) {
    res.status(500).json({ error: 'Server error deleting note.' });
  }
});

router.get('/faculty/:id/public-schedule', async (req, res) => {
  try {
    const classes = await Schedule.find({ facultyId: req.params.id });
    const consultHours = await ConsultationHours.find({ facultyId: req.params.id });

    // Class blocks: strip subject/room entirely, just mark the hours as unavailable
    const publicClasses = classes.map(c => ({
      dayOfWeek: c.dayOfWeek,
      startTime: c.startTime,
      endTime: c.endTime,
      label: 'Class (Unavailable)'
    }));

    // Consultation blocks: these are exactly what students need to see in full
    const publicConsult = consultHours.map(c => ({
      dayOfWeek: c.dayOfWeek,
      startTime: c.startTime,
      endTime: c.endTime,
      label: 'Consultation Hours (Book Here)'
    }));

    res.json([...publicClasses, ...publicConsult]);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching schedule.' });
  }
});

// Complete a consultation and record the log entry (digital sign-off)
router.patch('/appointment/:id/complete', requireAuth(['FACULTY']), async (req, res) => {
  try {
    const { casePresented, interventionTaken, remarks } = req.body;
    const apt = await Appointment.findOne({ _id: req.params.id, facultyId: req.user.userId });
    if (!apt) return res.status(404).json({ error: 'Appointment not found.' });
    if (apt.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Only approved consultations can be completed.' });
    }
    if (apt.completedAt) {
      return res.status(400).json({ error: 'This consultation has already been signed off and cannot be edited.' });
    }

    apt.casePresented     = casePresented;
    apt.interventionTaken = interventionTaken;
    apt.remarks           = remarks;
    apt.status            = 'COMPLETED';
    apt.completedAt       = new Date();
    await apt.save();

    await notify(await resolveStudentId(apt), {
      type: 'CONSULTATION_LOGGED',
      title: 'Consultation completed',
      message: `Your consultation on ${fmtDate(apt.date)} was logged and signed off by your instructor.`,
    });

    res.json({ message: 'Consultation logged and signed off.', appointment: apt });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Fetch a faculty member's consultation log (completed entries, oldest first like the paper form)
router.get('/consultation-log/:facultyId', requireAuth(['FACULTY','ADMIN','DEAN']), ownerOrStaff(r => r.params.facultyId), async (req, res) => {
  try {
    const log = await Appointment.find({ 
      facultyId: req.params.facultyId, 
      status: 'COMPLETED' 
    }).sort({ completedAt: 1 });
    res.json(log);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching consultation log.' });
  }
});

// Anyone can check a faculty member's declared hours (students need this to book)
router.get('/consultation-hours/:facultyId', requireAuth(ALL_ROLES), async (req, res) => {
  const hours = await ConsultationHours.find({ facultyId: req.params.facultyId });
  res.json(hours);
});

// =========================================================================
// === NOTIFICATIONS (each user only ever sees their own) ==================
// =========================================================================
router.get('/notifications', requireAuth(ALL_ROLES), async (req, res) => {
  try {
    const userId = req.user.userId;
    const [items, unreadCount] = await Promise.all([
      Notification.find({ userId }).sort({ createdAt: -1 }).limit(30),
      Notification.countDocuments({ userId, read: false }),
    ]);
    res.json({ unreadCount, items });
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching notifications.' });
  }
});

router.patch('/notifications/read-all', requireAuth(ALL_ROLES), async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user.userId, read: false }, { $set: { read: true } });
    res.json({ message: 'All notifications marked as read.' });
  } catch (error) {
    res.status(500).json({ error: 'Server error updating notifications.' });
  }
});

router.patch('/notifications/:id/read', requireAuth(ALL_ROLES), async (req, res) => {
  try {
    await Notification.updateOne({ _id: req.params.id, userId: req.user.userId }, { $set: { read: true } });
    res.json({ message: 'Marked as read.' });
  } catch (error) {
    res.status(500).json({ error: 'Server error updating notification.' });
  }
});

// =========================================================================
// === EMAIL VERIFICATION ===
// =========================================================================

// Confirms the token from the verification email and activates the account.
router.get('/verify-email/:token', async (req, res) => {
  try {
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

    const user = await User.findOne({
      verificationToken: hashedToken,
      verificationTokenExpires: { $gt: Date.now() }
    }).select('+verificationToken +verificationTokenExpires');

    if (!user) {
      return res.status(400).json({ error: 'This verification link is invalid or has expired.' });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    res.json({ message: 'Email verified! You can now log in.' });
  } catch (error) {
    res.status(500).json({ error: 'Server error verifying email.' });
  }
});

// =========================================================================
// === FORGOT PASSWORD ===
// =========================================================================

// Step 1: request a reset link. Always replies with the same neutral message,
// whether or not that email belongs to an account — this stops the endpoint
// being used to check which emails are registered students/faculty.
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: (email || '').toLowerCase() });

    if (user) {
      const rawResetToken = crypto.randomBytes(32).toString('hex');
      const hashedResetToken = crypto.createHash('sha256').update(rawResetToken).digest('hex');

      user.resetPasswordToken = hashedResetToken;
      user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
      await user.save();

      const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();
      const resetLink = `${frontendUrl}/reset-password/${rawResetToken}`;
      await sendResetEmail(user.email, resetLink);
    }

    res.json({ message: 'If an account exists for this email, a password reset link has been sent.' });
  } catch (error) {
    res.status(500).json({ error: 'Server error processing the request.' });
  }
});

// Step 2: the link's token is checked, the new password is validated with the
// same rule used at registration, and the token is single-use (cleared on success).
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { newPassword } = req.body;

    const passwordPattern = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;
    if (!passwordPattern.test(newPassword)) {
      return res.status(400).json({ error: 'Password must be at least 12 characters, with 1 uppercase letter, 1 number, and 1 symbol.' });
    }

    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    }).select('+resetPasswordToken +resetPasswordExpires');

    if (!user) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Password updated. You can now log in with your new password.' });
  } catch (error) {
    res.status(500).json({ error: 'Server error resetting password.' });
  }
});

module.exports = router;
