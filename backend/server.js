const startStatusUpdater = require('./jobs/statusUpdater');
const startConsultationReminder = require('./jobs/consultationReminder');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config(); // This loads variables from the .env file

// Initialize the Express app
const app = express();

// Middleware
// Only the frontend URL(s) listed in .env may call this API from a browser.
// FRONTEND_URL can be a single URL ("http://localhost:5173") or a comma-separated
// list ("http://localhost:5173,https://your-deployed-site.vercel.app").
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. curl, Postman, server-to-server) and
    // any origin explicitly listed in FRONTEND_URL.
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json()); // Allows the server to accept JSON data in requests

// ROUTES
const facultyRoutes = require('./routes/faculty');
app.use('/api/faculty', facultyRoutes);

const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes); // This adds the /api/auth prefix

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB Atlas Cloud');

    startStatusUpdater();
    startConsultationReminder();

    // Only start listening for requests AFTER the database connects
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Cloud Connection Error:', error.message);
  });

// A simple test route to make sure the server is alive
app.get('/', (req, res) => {
  res.send('Faculty Attendance API is running...');
});