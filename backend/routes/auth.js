const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const RosterEntry = require('../models/RosterEntry');
const { requireAuth } = require('../middleware/auth');
const { decideSignIn, parseList } = require('../utils/signInPolicy');

const router = express.Router();

const googleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 40,
  message: { error: 'Too many sign-in attempts. Please try again in a few minutes.' }
});

const signToken = (user) =>
  jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '8h' });

// Same shape the old password login returned, so the dashboards need no changes.
const sessionPayload = (user) => ({
  token: signToken(user),
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  programPosition: user.programPosition || '',
  onboardingComplete: user.onboardingComplete !== false
});

// POST /api/auth/google  { credential }  <- the ID token from Google's sign-in button
router.post('/google', googleLimiter, async (req, res) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(500).json({ error: 'Google sign-in is not configured on the server.' });
    const { credential } = req.body || {};
    if (!credential) return res.status(400).json({ error: 'Missing Google credential.' });

    let payload;
    try {
      const ticket = await new OAuth2Client(clientId).verifyIdToken({ idToken: credential, audience: clientId });
      payload = ticket.getPayload();
    } catch {
      return res.status(401).json({ error: 'Google sign-in could not be verified. Please try again.' });
    }

    const email = (payload.email || '').toLowerCase();
    const existingUser = await User.findOne({ email });
    const rosterEntry = existingUser ? null : await RosterEntry.findOne({ email });

    const decision = decideSignIn({
      payload,
      allowedDomains: parseList(process.env.ALLOWED_EMAIL_DOMAIN),
      adminEmails: parseList(process.env.ADMIN_EMAILS),
      existingUser,
      rosterRole: rosterEntry?.role || null
    });
    if (decision.action === 'DENY') return res.status(403).json({ error: decision.error });

    let user = existingUser;
    if (decision.action === 'CREATE') {
      user = await User.create({
        role: decision.role,
        name: payload.name || email,
        email,
        googleSub: payload.sub,
        isVerified: true,
        accountStatus: 'ACTIVE',
        onboardingComplete: false
      });
    } else if (!user.googleSub) {
      user.googleSub = payload.sub; // link an older account to its Google identity
      user.isVerified = true;
      await user.save();
    } else if (user.googleSub !== payload.sub) {
      return res.status(403).json({ error: 'This account is linked to a different Google account.' });
    }

    res.json(sessionPayload(user));
  } catch (error) {
    console.error('Google sign-in error:', error.message);
    res.status(500).json({ error: 'Sign-in failed. Please try again.' });
  }
});

const STUDENT_ID = /^(\d{4}-\d{4}-[A-Z]|\d{4}-S0\d{4})$/;
const FACULTY_ID = /^UA-[A-Z]{5}-\d{4}-\d{4}$/;

// POST /api/auth/onboarding  — first-login details Google can't supply.
router.post('/onboarding', requireAuth(['STUDENT', 'FACULTY', 'DEAN', 'ADMIN']), async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.onboardingComplete !== false) return res.status(400).json({ error: 'Profile is already complete.' });

    const { name, gender, programPosition, schoolId, facultyId, noIdYet, privacyAccepted } = req.body || {};
    if (privacyAccepted !== true) return res.status(400).json({ error: 'Please accept the Privacy Policy.' });
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required.' });
    if (!['Male', 'Female'].includes(gender)) return res.status(400).json({ error: 'Gender is required.' });
    if (!programPosition || !String(programPosition).trim()) {
      return res.status(400).json({ error: user.role === 'STUDENT' ? 'Program, year and section are required.' : 'Position is required.' });
    }

    user.name = String(name).trim();
    user.gender = gender;
    user.programPosition = String(programPosition).trim();
    user.privacyAcceptedAt = new Date();
    user.noIdYet = !!noIdYet;

    if (!noIdYet) {
      if (user.role === 'STUDENT') {
        const id = String(schoolId || '').toUpperCase();
        if (!STUDENT_ID.test(id)) return res.status(400).json({ error: 'Invalid School ID format.' });
        user.schoolId = id;
      } else if (user.role === 'FACULTY') {
        const id = String(facultyId || '').toUpperCase();
        if (!FACULTY_ID.test(id)) return res.status(400).json({ error: 'Invalid Faculty ID format.' });
        user.facultyId = id;
      }
    }
    user.onboardingComplete = true;
    await user.save();
    res.json(sessionPayload(user));
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'That ID is already registered to another account.' });
    console.error('Onboarding error:', error.message);
    res.status(500).json({ error: 'Could not save your details.' });
  }
});

module.exports = router;
