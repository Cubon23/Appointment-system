const bcrypt = require('bcryptjs');
const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const User = require('../models/User'); 
const Schedule = require('../models/Schedule');
const Appointment = require('../models/Appointment');
const Announcement = require('../models/Announcement');
const StatusHistory = require('../models/StatusHistory');
const crypto = require('crypto'); // Built-in Node.js module for secure hashes
const ConsultationHours = require('../models/ConsultationHours');
const { isOverlapping } = require('../utils/timeMath');
const { requireAuth } = require('../middleware/auth');

// =========================================================================
// === ROUTES ===
// =========================================================================

// === 1. SECURE REGISTRATION ROUTE (With Bcrypt) ===
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, programPosition, schoolId, facultyId } = req.body;

    if (!email.toLowerCase().endsWith('@ua.edu.ph')) {
      return res.status(400).json({ error: 'Registration denied. You must use a valid @ua.edu.ph university email.' });
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

    const accountStatus = 
      (role === 'STUDENT' && !schoolId) ? 'PENDING_APPROVAL' :
      (role === 'FACULTY' && !facultyId) ? 'PENDING_APPROVAL' :
      'ACTIVE';

    const newUser = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword, // Secured.
      role,
      programPosition,
      schoolId,
      facultyId,
      accountStatus,
      currentStatus: 'OUT_OF_OFFICE'
    });

    res.json({ 
      message: role === 'STUDENT' ? 'Registration successful!' : 'Registration submitted. Awaiting Admin approval.',
      accountStatus 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// === 2. SECURE LOGIN ROUTE ===
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Find the user
    const user = await User.findOne({ email: email.toLowerCase() });

    console.log("DIAGNOSTIC - User found:", user ? "YES" : "NO", "| Email searched:", email.toLowerCase());
    
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

    // 3. Cryptographically verify the password (Declared only ONCE)
    const isMatch = await bcrypt.compare(password, user.password);
    console.log("DIAGNOSTIC - Password Match:", isMatch);
    
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
router.get('/status', async (req, res) => {
  try {
    const facultyList = await User.find({ role: 'FACULTY' })
      .select('name programPosition currentStatus currentLocation room statusUpdatedAt statusNote qrHash')
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
router.put('/appointment/:id', async (req, res) => {
  try {
    const { status } = req.body;
    
    // Replace with your actual Appointment model reference if imported differently
    const targetApt = await Appointment.findById(req.params.id);

    if (!targetApt) {
      return res.status(404).json({ error: 'Appointment not found.' });
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
    targetApt.status = status;
    await targetApt.save();

    res.json(targetApt);

  } catch (error) {
    console.error('Appointment Collision Check Error:', error);
    res.status(500).json({ error: 'Server error processing appointment interval math.' });
  }
});

// 3. GET ROUTE: Fetch schedule for a specific faculty member
router.get('/my-schedule/:facultyId', async (req, res) => {
  try {
    const schedules = await Schedule.find({ facultyId: req.params.facultyId })
      .sort({ dayOfWeek: 1, startTime: 1 });
    res.json(schedules);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching schedule.' });
  }
});

// 4. POST ROUTE: Admin assigns a schedule to a faculty member
router.post('/schedule/add', async (req, res) => {
  const { facultyId, subject, room, dayOfWeek, startTime, endTime } = req.body;
  try {
    await Schedule.create({ facultyId, subject, room, dayOfWeek, startTime, endTime });
    res.json({ message: 'Schedule assigned successfully!' });
  } catch (error) {
    res.status(500).json({ error: 'Server error assigning schedule.' });
  }
});

// 5. POST ROUTE: Admin adds a new faculty member (QR Generation)
router.post('/add', async (req, res) => {
  const { name, email, programPosition, room, role, schoolId, facultyId } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const qrHash = email.split('@')[0] + '_qr_' + new Date().getFullYear();

    const newUser = new User({
      name,
      email,
      programPosition,
      room,
      role: role || 'FACULTY',
      qrHash,
      schoolId,
      facultyId,
      currentStatus: 'OUT_OF_OFFICE',
    });

    await newUser.save();
    res.json({ message: 'Account provisioned successfully', qrHash, facultyName: name });
  } catch (error) {
    res.status(500).json({ error: 'Error provisioning account' });
  }
});

// 6. GET ROUTE: Seed Database with Real BS INFO 3D Schedule
router.get('/seed', async (req, res) => {
  try {
    await User.deleteMany({ role: { $in: ['FACULTY', 'ADMIN', 'DEAN', 'STUDENT'] } });
    await Schedule.deleteMany({});
    await Appointment.deleteMany({});
    await Announcement.deleteMany({});


    res.json({ message: "Successfully seeded Local Database for presentation!" });
  } catch (error) {
    res.status(500).json({ error: 'Error seeding data', details: error.message });
  }
});

// 7. GET ROUTE: Fetch announcements by section
router.get('/announcements/:section', async (req, res) => {
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
router.post('/appointment', async (req, res) => {
  try {
    const { facultyId, date, time, studentName, studentSection, reason } = req.body;
    
    const studentId = req.body.studentId || null; 

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

    res.json({ message: 'Appointment requested successfully!', appointment: newAppointment });

  } catch (error) {
    console.error('Student Booking Error:', error);
    res.status(500).json({ error: 'Server error processing the appointment request.' });
  }
});

// 9. GET ROUTE: Admin fetches ALL appointments
router.get('/appointments/all', async (req, res) => {
  try {
    const appointments = await Appointment.find().populate('facultyId', 'name').sort({ createdAt: -1 });
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching all appointments' });
  }
});

// 10. GET ROUTE: Fetch all unverified users
router.get('/users/all', async (req, res) => {
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
router.patch('/users/:id/verify', async (req, res) => {
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
router.get('/appointments/me/:facultyId', async (req, res) => {
  try {
    const appointments = await Appointment.find({ facultyId: req.params.facultyId }).sort({ createdAt: -1 });
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching my appointments' });
  }
});

// 13. PUT ROUTE: Save a Notice
router.put('/notice/:id', async (req, res) => {
  try {
    const updated = await User.findByIdAndUpdate(req.params.id, { noticeMessage: req.body.notice }, { new: true });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: 'Error saving notice' }); }
});

// 14. PUT ROUTE: Save a Future Flag Date & AUTO-CANCEL Appointments on that date
router.put('/flag-date/:id', async (req, res) => {
  try {
    const { flagDate, reason } = req.body;
    
    const updated = await User.findByIdAndUpdate(
      req.params.id, 
      { flaggedDate: flagDate, flaggedReason: reason }, 
      { new: true }
    );

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

    res.json(updated);
  } catch (err) { res.status(500).json({ error: 'Error saving flag date' }); }
});

// 15. GET ROUTE: Fetch appointments for one specific student
router.get('/appointments/student/:studentName', async (req, res) => {
  try {
    const appointments = await Appointment.find({ studentName: req.params.studentName })
      .populate('facultyId', 'name')
      .sort({ createdAt: -1 });
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching student appointments' });
  }
});

// Faculty sets/updates their consultation hours
// const timeToMinutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

router.post('/consultation-hours', async (req, res) => {
  try {
    const { facultyId, hours } = req.body; // [{ dayOfWeek, startTime, endTime }, ...]

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

// Complete a consultation and record the log entry (digital sign-off)
router.patch('/appointment/:id/complete', async (req, res) => {
  try {
    const { casePresented, interventionTaken, remarks } = req.body;
    const apt = await Appointment.findById(req.params.id);
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

    res.json({ message: 'Consultation logged and signed off.', appointment: apt });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Fetch a faculty member's consultation log (completed entries, oldest first like the paper form)
router.get('/consultation-log/:facultyId', async (req, res) => {
  try {
    const log = await Appointment.find({ 
      facultyId: req.params.facultyId, 
      status: 'COMPLETED' 
    }).sort({ date: 1, time: 1 });
    res.json(log);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching consultation log.' });
  }
});

// Anyone can check a faculty member's declared hours (students need this to book)
router.get('/consultation-hours/:facultyId', async (req, res) => {
  const hours = await ConsultationHours.find({ facultyId: req.params.facultyId });
  res.json(hours);
});

module.exports = router;