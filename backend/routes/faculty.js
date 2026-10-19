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

const { sendVerificationEmail, sendApprovedEmail, sendResetEmail } = require('../utils/mailer');
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

// Exactly one "@", a plain local part, and the gmail.com domain.
// (Rejects "name@gmail.com@gmail.com", which happens when someone types the full
// address into a field that already appends "@gmail.com".)
const GMAIL_REGEX = /^[a-z0-9._+-]+@gmail\.com$/;
// Generic shape check for admin-provisioned accounts (any domain, but still a single "@").
const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// Official ID formats (same rules as the User model).
const SCHOOL_ID_REGEX = /^(\d{4}-\d{4}-[A-Z]|\d{4}-S0\d{4})$/;
const FACULTY_ID_REGEX = /^UA-[A-Z]{5}-\d{4}-\d{4}$/;
const Broadcast = require('../models/Broadcast');
const { manilaNow, manilaDate } = require('../utils/manilaTime');

// Booking / cancellation time limits (appointment date + time are Manila time)
const BOOKING_LEAD_HOURS  = 12; // students must request at least this long before the appointment
const CANCEL_CUTOFF_HOURS = 8;  // an APPROVED appointment can't be cancelled inside this window
const hoursUntil = (date, time) => (manilaDate(date, time).getTime() - Date.now()) / 36e5;

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
// Gives the user a fresh one-time email-verification token (only its hash is stored, valid 24h)
// and returns the link to put in the email. Any earlier link stops working.
async function issueVerificationLink(user) {
  const raw = crypto.randomBytes(32).toString('hex');
  user.verificationToken = crypto.createHash('sha256').update(raw).digest('hex');
  user.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000;
  await user.save();
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();
  return `${frontendUrl}/verify-email/${raw}`;
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, programPosition, schoolId, facultyId, privacyAccepted, gender, noIdYet } = req.body;

    // Consent must be explicit, and is enforced here too — not just by the checkbox in the browser.
    if (privacyAccepted !== true) {
      return res.status(400).json({ error: 'You must accept the Privacy Policy to register.' });
    }

    // Gender is collected once, here (students and faculty), instead of on every appointment.
    if (!['Male', 'Female'].includes(gender)) {
      return res.status(400).json({ error: 'Please select your gender.' });
    }

    // Registered names read "Last name, First name, Middle initial" so records stay consistent.
    // (A title such as "Prof." may come first, so only the comma between last and first is checked.)
    if (typeof name !== 'string' || !/^[^,]+,[^,]+/.test(name.trim())) {
      return res.status(400).json({ error: 'Please enter your name as: Last name, First name, Middle initial.' });
    }

    // Originally this required @ua.edu.ph specifically. The school never actually
    // provisioned working mailboxes on that domain, so verification emails sent to
    // it silently went nowhere and nobody could complete registration. Per guidance
    // from the school's own network administrator, this now requires @gmail.com
    // specifically — not just any email — because mailer.js sends through Gmail SMTP,
    // and a Gmail recipient is the one case we can be confident is actually
    // deliverable (so the verify-email and forgot-password links reliably arrive).
    // Identity itself is still established by Admin's manual ID verification
    // (PENDING_APPROVAL -> Verification Queue), not by the email domain.
    if (typeof email !== 'string' || !GMAIL_REGEX.test(email.trim().toLowerCase())) {
      return res.status(400).json({ error: 'Please register with a Gmail address (e.g. yourname@gmail.com).' });
    }

    const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    if (role === 'ADMIN' || role === 'DEAN') {
      return res.status(403).json({ error: 'Restricted role. Contact IT department.' });
    }

    // School ID (students) / Faculty ID (faculty) is required and format-checked, unless the person
    // ticked "I don't have my ID yet". Those accounts are flagged (noIdYet) and an Admin adds the
    // ID later in User Management.
    const hasNoId = noIdYet === true;
    const rawId = String((role === 'STUDENT' ? schoolId : facultyId) || '').trim().toUpperCase();
    if (!hasNoId) {
      const label = role === 'STUDENT' ? 'School ID' : 'Faculty ID';
      if (!rawId) {
        return res.status(400).json({ error: `Please enter your ${label}, or tick "I don't have my ID yet".` });
      }
      if (!(role === 'STUDENT' ? SCHOOL_ID_REGEX : FACULTY_ID_REGEX).test(rawId)) {
        return res.status(400).json({ error: `That ${label} is not in a valid format.` });
      }
      const idTaken = await User.findOne(role === 'STUDENT' ? { schoolId: rawId } : { facultyId: rawId });
      if (idTaken) {
        return res.status(400).json({ error: `An account with this ${label} already exists.` });
      }
    }
    
    // Password Strength Validation
    const passwordPattern = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;
    if (!passwordPattern.test(password)) {
      return res.status(400).json({ error: 'Password must be at least 12 characters, with 1 uppercase letter, 1 number, and 1 symbol.' });
    }

    // Hash the password before saving/bcrypting it to the database
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // The schoolId/facultyId typed at registration is kept on the account as-is. Students and
    // faculty still wait for an Admin to approve them in the Verification Queue
    // (PATCH /users/:id/verify) — the Admin approves; they do not assign an ID.
    const accountStatus = (role === 'STUDENT' || role === 'FACULTY') ? 'PENDING_APPROVAL' : 'ACTIVE';

    // Accounts waiting for Admin approval get NO verification email yet. It used to be sent here,
    // but approval can take days: the 24-hour link had expired (or been forgotten) by then, so the
    // email "went nowhere". The email is now sent at the moment the Admin approves the account.
    const needsApproval = accountStatus === 'PENDING_APPROVAL';

    const newUser = await User.create({
      name,
      gender,
      email: email.trim().toLowerCase(),
      password: hashedPassword, // Secured.
      role,
      programPosition,
      schoolId: role === 'STUDENT' && !hasNoId ? rawId : undefined,
      facultyId: role === 'FACULTY' && !hasNoId ? rawId : undefined,
      noIdYet: hasNoId,
      accountStatus,
      currentStatus: 'OUT_OF_OFFICE',
      isVerified: false,
      privacyAcceptedAt: new Date()
    });

    if (needsApproval) {
      await notifyRole('ADMIN', {
        type: 'REGISTRATION',
        title: 'New registration awaiting approval',
        message: `${name} (${role}) registered${hasNoId ? ' without an ID' : ''} and is awaiting approval in the Verification Queue.`,
      });
    } else {
      // Accounts that need no approval verify their email right away.
      const verificationLink = await issueVerificationLink(newUser);
      await sendVerificationEmail(newUser.email, verificationLink);
    }

    res.json({
      message: needsApproval
        ? 'Registration received! An administrator will review your account. We will email you once it is approved, then you can verify your email and log in.'
        : 'Registration received! Please check your email to verify your account before logging in.',
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
      return res.status(403).json({ error: 'Access Denied: Your account is still awaiting Admin approval. You will receive an email once it is approved.' });
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

    // Compare Manila calendar days. new Date().setHours(0,0,0,0) uses the server's
    // own timezone (UTC on most hosts), which made early-morning check-ins look stale.
    const todayManila = manilaNow().dateStr;

    const enriched = facultyList.map(f => {
      const obj = f.toObject();
      const updatedToday = f.statusUpdatedAt && manilaNow(new Date(f.statusUpdatedAt)).dateStr === todayManila;
      
      const scheduleDriven = obj.currentStatus === 'IN_CLASS' || obj.currentStatus === 'IN_CONSULTATION';
      if (!updatedToday && !scheduleDriven) {
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
    // Reason given when a request is cancelled by the student or declined (rejected)
    const reason = String(req.body.reason || '').trim().slice(0, 300);
    
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
      // Students can only cancel a request that is still open (pending or approved)
      if (!['PENDING', 'APPROVED'].includes(targetApt.status)) {
        return res.status(400).json({ error: 'This consultation can no longer be cancelled.' });
      }
      // Pending or approved: cancelling needs 8+ hours before the appointment
      if (hoursUntil(targetApt.date, targetApt.time) < CANCEL_CUTOFF_HOURS) {
        return res.status(400).json({ error: `Requests and appointments can only be cancelled at least ${CANCEL_CUTOFF_HOURS} hours before the scheduled time.` });
      }
    }
    // Faculty (or anyone else) approving / declining a request has the same 8-hour cutoff
    if ((status === 'APPROVED' || status === 'REJECTED') && hoursUntil(targetApt.date, targetApt.time) < CANCEL_CUTOFF_HOURS) {
      return res.status(400).json({ error: `Requests can only be approved or declined at least ${CANCEL_CUTOFF_HOURS} hours before the requested time.` });
    }
    if ((status === 'CANCELLED BY STUDENT' || status === 'REJECTED') && !reason) {
      return res.status(400).json({ error: 'Please select or enter a reason.' });
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
      if (isOverlapping(targetApt.time, allExistingEvents, targetApt.duration)) {
        return res.status(409).json({ 
          error: 'Double-Booking Prevented: This time block conflicts with an existing class or approved appointment.' 
        });
      }
    }

    // If math clears (or if they are just rejecting/canceling), execute the database write
    const previousStatus = targetApt.status;
    targetApt.status = status;
    if (status === 'CANCELLED BY STUDENT' || status === 'REJECTED') targetApt.cancelReason = reason;
    await targetApt.save();

    if (status !== previousStatus) {
      const when = `${fmtDate(targetApt.date)} at ${fmtTime(targetApt.time)}`;
      if (req.user.role === 'STUDENT') {
        await notify(targetApt.facultyId, {
          type: 'APPOINTMENT_UPDATE',
          title: 'Consultation cancelled by student',
          message: `${targetApt.studentName} cancelled the consultation on ${when}. Reason: ${reason}`,
        });
      } else {
        const faculty = await User.findById(targetApt.facultyId).select('name');
        const verb = status === 'APPROVED' ? 'approved' : status === 'REJECTED' ? 'declined' : `updated to ${status}`;
        await notify(await resolveStudentId(targetApt), {
          type: 'APPOINTMENT_UPDATE',
          title: `Consultation ${verb}`,
          message: `Your request with ${faculty ? faculty.name : 'your instructor'} on ${when} was ${verb}.${status === 'REJECTED' && reason ? ` Reason: ${reason}` : ''}`,
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
  const { name, programPosition, room, role, schoolId, facultyId } = req.body;
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  try {
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address (a single "@", e.g. name@gmail.com).' });
    }
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

    // Duration in minutes: a whole number from 1 to 60 (max 1 hour). Defaults to 60 for older clients.
    const MAX_DURATION_MINUTES = 60;
    const duration = req.body.duration === undefined ? 60 : Number(req.body.duration);
    if (!Number.isInteger(duration) || duration < 1 || duration > MAX_DURATION_MINUTES) {
      return res.status(400).json({ error: 'Consultation duration must be between 1 minute and 1 hour.' });
    }

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

    // 0b. Requests must be made at least 12 hours before the requested time
    if (hoursUntil(date, time) < BOOKING_LEAD_HOURS) {
      return res.status(400).json({
        error: `Booking Denied: Appointments must be requested at least ${BOOKING_LEAD_HOURS} hours before the requested time.`
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
      requestedMinutes >= timeToMinutes(h.startTime) && requestedMinutes + duration <= timeToMinutes(h.endTime)
    );
    if (!withinHours) {
      return res.status(400).json({ error: 'This time and duration doesn\'t fit inside the faculty member\'s consultation hours.' });
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
    if (isOverlapping(time, allExistingEvents, duration)) {
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
      duration,
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

// Approve a pending student/faculty account. The Admin does not assign an ID here: the
// School ID / Faculty ID the person entered at registration stays on the account untouched.
// Approving is also the moment the person is emailed (a fresh verification link, or a plain
// "you can log in" notice if they had already confirmed their email).
router.patch('/users/:id/verify', requireAuth(STAFF), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('+verificationToken +verificationTokenExpires');
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.role !== 'STUDENT' && user.role !== 'FACULTY') {
      return res.status(400).json({ error: 'This role cannot be verified this way.' });
    }

    user.accountStatus = 'ACTIVE';
    await user.save();

    let emailSent = true;
    let notEmailed = false; // true when SMTP isn't set up, so nothing really left the server
    try {
      let result;
      if (user.isVerified) {
        const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();
        result = await sendApprovedEmail(user.email, { loginLink: frontendUrl });
      } else {
        result = await sendApprovedEmail(user.email, { verifyLink: await issueVerificationLink(user) });
      }
      notEmailed = !!(result && result.preview);
    } catch (mailError) {
      emailSent = false;
      console.error('Approval email failed:', mailError);
    }

    res.json({
      message: notEmailed
        ? `${user.name} has been approved. Email is not set up on this server, so nothing was emailed: they can click "Resend" on the login page and the link will appear on screen.`
        : emailSent
        ? `${user.name} has been approved. An email was sent to ${user.email}.`
        : `${user.name} has been approved, but the email could not be sent. Ask them to use "Resend" on the login page.`,
      emailSent,
      user
    });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Verification failed.' });
  }
});

// Admin adds or corrects a student's School ID / a faculty member's Faculty ID (User Management).
// This is how accounts that registered with "I don't have my ID yet" get their ID later.
router.patch('/users/:id/id', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role !== 'STUDENT' && user.role !== 'FACULTY') {
      return res.status(400).json({ error: 'Only student and faculty accounts have an ID.' });
    }

    const isStudent = user.role === 'STUDENT';
    const idValue = String(req.body.idValue || '').trim().toUpperCase();
    if (!(isStudent ? SCHOOL_ID_REGEX : FACULTY_ID_REGEX).test(idValue)) {
      return res.status(400).json({
        error: isStudent
          ? 'Invalid School ID format. Use 2024-1234-A or 2025-S04321.'
          : 'Invalid Faculty ID format. Use UA-COSFM-2025-1234.'
      });
    }
    const taken = await User.findOne({ [isStudent ? 'schoolId' : 'facultyId']: idValue, _id: { $ne: user._id } });
    if (taken) return res.status(400).json({ error: 'Another account already uses this ID.' });

    if (isStudent) user.schoolId = idValue; else user.facultyId = idValue;
    user.noIdYet = false;
    await user.save();

    res.json({
      message: `${isStudent ? 'School' : 'Faculty'} ID saved for ${user.name}.`,
      user: { _id: user._id, schoolId: user.schoolId, facultyId: user.facultyId, noIdYet: user.noIdYet }
    });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not save the ID.' });
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
// IN_CONSULTATION: auto-set by cron during consultation hour blocks;
// faculty may also select it manually.
const VALID_STATUSES = ['AVAILABLE', 'IN_CLASS', 'IN_CONSULTATION', 'IN_MEETING', 'ON_BREAK', 'OUT_OF_OFFICE', 'ON_LEAVE', 'ABSENT', 'NOT_UPDATED'];

router.put('/update-status/:id', requireAuth(['FACULTY']), ownerOnly(r => r.params.id), async (req, res) => {
  try {
    const { currentStatus, currentLocation } = req.body;
    if (!VALID_STATUSES.includes(currentStatus)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    // isManualOverride: true signals the cron to respect this status
    // until the next scheduled block starts, then auto resumes.
    const updated = await User.findByIdAndUpdate(
      req.params.id,
      {
        currentStatus,
        currentLocation,
        statusUpdatedAt:  new Date(),
        isManualOverride: true,
      },
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
    // MISSED (FACULTY) is what the system sets automatically when an approved consultation was
    // never signed off; the faculty can still log it late if the consultation did take place.
    if (apt.status !== 'APPROVED' && apt.status !== 'MISSED (FACULTY)') {
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

// Faculty cancels an APPROVED consultation (counted as "CANCELLED BY FACULTY" in the reports)
router.patch('/appointment/:id/cancel', requireAuth(['FACULTY']), async (req, res) => {
  try {
    const apt = await Appointment.findOne({ _id: req.params.id, facultyId: req.user.userId });
    if (!apt) return res.status(404).json({ error: 'Appointment not found.' });
    if (apt.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Only approved consultations can be cancelled. Use Reject for pending requests.' });
    }
    // Once the day is over it can no longer be cancelled: it is either signed off or missed.
    if (apt.date < manilaNow().dateStr) {
      return res.status(400).json({ error: 'This consultation date has already passed.' });
    }
    if (hoursUntil(apt.date, apt.time) < CANCEL_CUTOFF_HOURS) {
      return res.status(400).json({ error: `Approved appointments can only be cancelled at least ${CANCEL_CUTOFF_HOURS} hours before the scheduled time.` });
    }
    const reason = String(req.body.reason || '').trim().slice(0, 300);
    if (!reason) return res.status(400).json({ error: 'Please select or enter a reason.' });
    apt.status = 'CANCELLED BY FACULTY';
    apt.cancelReason = reason;
    await apt.save();

    const faculty = await User.findById(req.user.userId).select('name');
    await notify(await resolveStudentId(apt), {
      type: 'APPOINTMENT_UPDATE',
      title: 'Consultation cancelled by instructor',
      message: `${faculty ? faculty.name : 'Your instructor'} cancelled your consultation on ${fmtDate(apt.date)} at ${fmtTime(apt.time)}.${reason ? ` Reason: ${reason}` : ''}`,
    });
    res.json({ message: 'Consultation cancelled.', appointment: apt });
  } catch (error) {
    res.status(500).json({ error: 'Server error cancelling consultation.' });
  }
});

// Faculty marks that the student did not show up (counted as "MISSED (STUDENT)")
router.patch('/appointment/:id/no-show', requireAuth(['FACULTY']), async (req, res) => {
  try {
    const apt = await Appointment.findOne({ _id: req.params.id, facultyId: req.user.userId });
    if (!apt) return res.status(404).json({ error: 'Appointment not found.' });
    if (apt.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Only approved consultations can be marked as a no-show.' });
    }
    // Not before the appointment has actually started (Philippine time)
    if (Date.now() < manilaDate(apt.date, apt.time).getTime()) {
      return res.status(400).json({ error: 'This consultation has not started yet.' });
    }
    apt.status = 'MISSED (STUDENT)';
    apt.missedAt = new Date();
    await apt.save();

    await notify(await resolveStudentId(apt), {
      type: 'APPOINTMENT_UPDATE',
      title: 'Consultation missed',
      message: `You did not attend your consultation on ${fmtDate(apt.date)} at ${fmtTime(apt.time)}.`,
    });
    res.json({ message: 'Marked as student no-show.', appointment: apt });
  } catch (error) {
    res.status(500).json({ error: 'Server error marking no-show.' });
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

// ======================================================================
// MAILBOX: delete notifications (the bell's X and "Clear all" buttons)
// ======================================================================
router.delete('/notifications/:id', requireAuth(ALL_ROLES), async (req, res) => {
  try {
    await Notification.deleteOne({ _id: req.params.id, userId: req.user.userId });
    res.json({ message: 'Notification deleted.' });
  } catch (error) { res.status(500).json({ error: 'Server error deleting notification.' }); }
});

router.delete('/notifications', requireAuth(ALL_ROLES), async (req, res) => {
  try {
    await Notification.deleteMany({ userId: req.user.userId });
    res.json({ message: 'All notifications deleted.' });
  } catch (error) { res.status(500).json({ error: 'Server error clearing notifications.' }); }
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
// === RESEND VERIFICATION EMAIL ===
// =========================================================================

// For accounts that registered but never got a working link (lost email, SMTP not set up yet,
// link expired). Always replies with the same neutral message whether or not the email belongs
// to an account, so it can't be used to find out who is registered.
const resendVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many requests. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/resend-verification', resendVerificationLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: (email || '').toLowerCase() })
      .select('+verificationToken +verificationTokenExpires');

    // Accounts still waiting for Admin approval are skipped: they get their email on approval.
    let devLink;
    if (user && !user.isVerified && user.accountStatus !== 'PENDING_APPROVAL') {
      const link = await issueVerificationLink(user); // the old link stops working
      const result = await sendVerificationEmail(user.email, link);
      // Local development only (no SMTP set up): show the link on the page instead of the terminal.
      if (result && result.preview) devLink = link;
    }

    res.json({ message: 'If that account exists and still needs verification, a new link has been sent.', ...(devLink ? { devLink } : {}) });
  } catch (error) {
    res.status(500).json({ error: 'Could not send the email. Please try again later.' });
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
    let devLink;

    if (user) {
      const rawResetToken = crypto.randomBytes(32).toString('hex');
      const hashedResetToken = crypto.createHash('sha256').update(rawResetToken).digest('hex');

      user.resetPasswordToken = hashedResetToken;
      user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
      await user.save();

      const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();
      const resetLink = `${frontendUrl}/reset-password/${rawResetToken}`;
      const result = await sendResetEmail(user.email, resetLink);
      // Local development only (no SMTP set up): show the link on the page instead of the terminal.
      if (result && result.preview) devLink = resetLink;
    }

    res.json({ message: 'If an account exists for this email, a password reset link has been sent.', ...(devLink ? { devLink } : {}) });
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

// ======================================================================
// DEAN: EXECUTIVE BROADCAST
// A pinned message pushed to every Student/Faculty dashboard banner
// and their notification mailbox. Only DEAN can create/end them.
// ======================================================================

const broadcastStatus = (b, now = new Date()) =>
  b.endedAt ? 'ENDED' : (new Date(b.expiresAt) <= now ? 'EXPIRED' : 'ACTIVE');

// Dean sends a broadcast
router.post('/broadcasts', requireAuth(['DEAN']), async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    const message = String(req.body.message || '').trim();
    const audience = req.body.audience || 'ALL';
    const priority = req.body.priority || 'URGENT';
    const minutes = Number(req.body.durationMinutes);

    if (!title || title.length > 120) return res.status(400).json({ error: 'Title is required (max 120 characters).' });
    if (!message || message.length > 1000) return res.status(400).json({ error: 'Message is required (max 1000 characters).' });
    if (!['ALL', 'STUDENT', 'FACULTY'].includes(audience)) return res.status(400).json({ error: 'Invalid audience.' });
    if (!['URGENT', 'NOTICE'].includes(priority)) return res.status(400).json({ error: 'Invalid priority.' });
    if (!Number.isFinite(minutes) || minutes < 15 || minutes > 20160) {
      return res.status(400).json({ error: 'Duration must be between 15 minutes and 14 days.' });
    }

    const dean = await User.findById(req.user.userId).select('name');
    const broadcast = await Broadcast.create({
      title, message, audience, priority,
      expiresAt: new Date(Date.now() + minutes * 60 * 1000),
      createdBy: req.user.userId,
      createdByName: dean ? dean.name : 'Office of the Dean',
    });

    const roles = audience === 'ALL' ? ['STUDENT', 'FACULTY'] : [audience];
    const recipients = await User.countDocuments({ role: { $in: roles }, accountStatus: 'ACTIVE' });
    for (const role of roles) {
      await notifyRole(role, { type: 'DEAN_BROADCAST', title: `Dean's Office: ${title}`, message });
    }

    res.status(201).json({ broadcast, recipients });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error sending broadcast.' });
  }
});

// Active broadcasts for the current user's role (Student/Faculty banner feed)
router.get('/broadcasts/active', requireAuth(ALL_ROLES), async (req, res) => {
  try {
    const now = new Date();
    const list = await Broadcast.find({
      audience: { $in: ['ALL', req.user.role] },
      endedAt: null,
      expiresAt: { $gt: now },
    }).sort({ createdAt: -1 });
    const out = list
      .map(b => ({
        _id: b._id, title: b.title, message: b.message, priority: b.priority,
        createdByName: b.createdByName, createdAt: b.createdAt, expiresAt: b.expiresAt,
      }))
      .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'URGENT' ? -1 : 1));
    res.json(out);
  } catch (error) { res.status(500).json({ error: 'Server error fetching broadcasts.' }); }
});

// Dean: history of all broadcasts
router.get('/broadcasts', requireAuth(['DEAN']), async (req, res) => {
  try {
    const now = new Date();
    const list = await Broadcast.find({}).sort({ createdAt: -1 }).limit(50);
    res.json(list.map(b => ({ ...(b.toObject ? b.toObject() : b), status: broadcastStatus(b, now) })));
  } catch (error) { res.status(500).json({ error: 'Server error fetching broadcast history.' }); }
});

// Dean: end a broadcast early
router.patch('/broadcasts/:id/end', requireAuth(['DEAN']), async (req, res) => {
  try {
    const b = await Broadcast.findById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Broadcast not found.' });
    if (!b.endedAt) { b.endedAt = new Date(); await b.save(); }
    res.json({ message: 'Broadcast ended.' });
  } catch (error) { res.status(500).json({ error: 'Server error ending broadcast.' }); }
});


module.exports = router;
