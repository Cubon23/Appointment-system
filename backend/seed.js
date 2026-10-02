require('dotenv').config(); // <-- NEW: Load the .env file
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); 

// Connect to the EXACT same database as your main server
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('Connected to MongoDB for seeding...'))
.catch(err => console.error('Database connection error:', err));

// Define Schema references
const User = require('./models/User'); 
const Schedule = require('./models/Schedule');
const Appointment = require('./models/Appointment');
const Announcement = require('./models/Announcement');
const ConsultationHours = require('./models/ConsultationHours');

const seedDatabase = async () => {
  try {
    console.log('INITIATING NUCLEAR WIPE...');
    await User.deleteMany({});
    await Schedule.deleteMany({});
    await Appointment.deleteMany({});
    await Announcement.deleteMany({});
    await ConsultationHours.deleteMany({});

    console.log('Generating encrypted default passwords...');
    const salt = await bcrypt.genSalt(10);
    const defaultPassword = await bcrypt.hash('Password123!', salt); // ANG ATON PASSWORD

    console.log('Database is empty. Planting fresh, secured accounts...');

    // 1. Core System Accounts
    await User.create({ 
      role: 'ADMIN', 
      name: 'System Admin', 
      email: 'admin@ua.edu.ph', 
      password: defaultPassword,
      accountStatus: 'ACTIVE',
      qrHash: 'admin_qr_999', 
      programPosition: 'IT Department' 
    });

    await User.create({ 
      role: 'DEAN', 
      name: 'John C. Amar, DMgt', 
      email: 'jamar@ua.edu.ph', 
      password: defaultPassword,
      accountStatus: 'ACTIVE',
      qrHash: 'dean_qr_777', 
      programPosition: 'Dean of CCIS', 
      currentStatus: 'AVAILABLE' 
    });

    console.log('Planting real instructors...');

    // 2. Create the Instructors (With encrypted passwords and ACTIVE status)
    const instructors = await User.insertMany([
      {
        name: 'Ledilyn H. Colmo',
        email: 'lcolmo@ua.edu.ph',
        password: defaultPassword,
        accountStatus: 'ACTIVE',
        role: 'FACULTY',
        programPosition: 'Faculty / Librarian',
        qrHash: 'colmo_qr_2026', 
        currentStatus: 'OUT_OF_OFFICE',
        room: 'New Library'
      },
      {
        name: 'Mary Anne E. Edjan',
        email: 'medjan@ua.edu.ph',
        password: defaultPassword,
        accountStatus: 'ACTIVE',
        role: 'FACULTY',
        programPosition: 'Faculty',
        qrHash: 'edjan_qr_2026',
        currentStatus: 'OUT_OF_OFFICE',
        room: 'Old Library'
      },
      {
        name: 'Ronnie C. Fortaleza',
        email: 'rfortaleza@ua.edu.ph',
        password: defaultPassword,
        accountStatus: 'ACTIVE',
        role: 'FACULTY',
        programPosition: 'Faculty',
        qrHash: 'fortaleza_qr_2026',
        currentStatus: 'OUT_OF_OFFICE',
        room: 'ICT 101 A'
      },
      {
        name: 'Carl Spence Percy',
        email: 'cpercy@ua.edu.ph',
        password: defaultPassword,
        accountStatus: 'ACTIVE',
        role: 'FACULTY',
        programPosition: 'Program Head, BSIT',
        qrHash: 'percy_qr_2026',
        currentStatus: 'OUT_OF_OFFICE',
        room: 'IICT 306'
      },
      {
        name: 'Sarah Mae R. Silva',
        email: 'ssilva@ua.edu.ph',
        password: defaultPassword,
        accountStatus: 'ACTIVE',
        role: 'FACULTY',
        programPosition: 'Faculty',
        qrHash: 'silva_qr_2026',
        currentStatus: 'OUT_OF_OFFICE',
        room: 'IICT 305'
      }
    ]);

    const [colmoId, edjanId, fortalezaId, percyId, silvaId] = instructors.map(i => i._id);

    console.log('Assigning official schedules...');

    // Silva's official load (Day: 1=Mon ... 5=Fri)
    const SE = 'COMSC 9';   // Software Engineering 2
    const CAP = 'INFOT 9';  // Capstone Project 1
    const row = (dayOfWeek, startTime, endTime, name, section, room) =>
      ({ facultyId: silvaId, subject: `${name} (${section})`, room, dayOfWeek, startTime, endTime });
    const capDay = d => [
      row(d, '07:00', '08:30', CAP, 'BS INFO 3C', 'IICT 305'),
      row(d, '08:30', '10:00', CAP, 'BS INFO 3B', 'IICT 305'),
      row(d, '10:00', '11:30', CAP, 'BS INFO 3D', 'IICT 305'),
      row(d, '14:30', '16:00', CAP, 'BS INFO 3A', 'IICT 108'),
    ];
    const seDay = d => [
      row(d, '08:00', '09:30', SE, 'BSCS 3A-INS', 'IICT 201'),
      row(d, '09:30', '11:00', SE, 'BSCS 3B-SE',  'IICT 201'),
      row(d, '11:00', '12:00', SE, 'BSCS 3A-INS', 'IICT 106'),
    ];
    const silvaSchedule = [
      row(1, '08:30', '10:30', SE, 'BSCS 3B-SE', 'IICT 106'),
      ...capDay(2), ...seDay(3), ...capDay(4), ...seDay(5),
    ];

    // 3. Insert their specific schedules (Day: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri)
    await Schedule.insertMany([
      { facultyId: colmoId, subject: 'LIS 6 (BLIS 2-A)', room: 'New Library', dayOfWeek: 2, startTime: '07:00', endTime: '08:30' },
      { facultyId: colmoId, subject: 'LIS 6 (BLIS 2-B)', room: 'New Library', dayOfWeek: 3, startTime: '07:00', endTime: '08:30' },
      { facultyId: colmoId, subject: 'LIS 6 (BLIS 2-A)', room: 'New Library', dayOfWeek: 4, startTime: '07:00', endTime: '08:30' },
      { facultyId: colmoId, subject: 'LIS 6 (BLIS 2-B)', room: 'New Library', dayOfWeek: 5, startTime: '07:00', endTime: '08:30' },
      { facultyId: edjanId, subject: 'LIS 2 (SC BLIS 1-B)', room: 'Old Library', dayOfWeek: 1, startTime: '09:30', endTime: '11:00' },
      { facultyId: edjanId, subject: 'LIS 2 (SC BLIS 1-A)', room: 'Old Library', dayOfWeek: 1, startTime: '12:00', endTime: '13:00' },
      { facultyId: edjanId, subject: 'LIS 2 (SC BLIS 1-A)', room: 'ICT 309', dayOfWeek: 2, startTime: '10:00', endTime: '11:00' },
      { facultyId: edjanId, subject: 'LIS 2 (SC BLIS 1-B)', room: 'Old Library', dayOfWeek: 3, startTime: '09:30', endTime: '11:00' },
      { facultyId: edjanId, subject: 'LIS 2 (SC BLIS 1-A)', room: 'ICT 309', dayOfWeek: 4, startTime: '10:00', endTime: '11:00' },
      // Ronnie C. Fortaleza — Faculty Individual Load, effectivity Feb 2, 2026
      { facultyId: fortalezaId, subject: 'ICT 1 (SC BSCD 1-C)', room: 'ICT 101 A', dayOfWeek: 1, startTime: '08:30', endTime: '10:30' },
      { facultyId: fortalezaId, subject: 'LIS 11 (SC BLIS 3-A)', room: 'ICT 301 (LAB)', dayOfWeek: 1, startTime: '10:30', endTime: '11:30' },
      { facultyId: fortalezaId, subject: 'SPT 6 (SC BLIS 3-A)', room: 'TBA', dayOfWeek: 1, startTime: '13:00', endTime: '14:00' },
      { facultyId: fortalezaId, subject: 'ELECT 2 (SC BSISM 3-C)', room: 'IICT 107 A', dayOfWeek: 1, startTime: '14:30', endTime: '15:30' },
      { facultyId: fortalezaId, subject: 'ISM 6 (SC BSISM 1-A)', room: 'IICT 101 A', dayOfWeek: 1, startTime: '16:00', endTime: '17:00' },

      { facultyId: fortalezaId, subject: 'LICT 3 (SC BLIS 2-B)', room: 'ICT 301 (LAB)', dayOfWeek: 2, startTime: '09:30', endTime: '11:30' },
      { facultyId: fortalezaId, subject: 'ELECT 2 (SC BSISM 3-C)', room: 'IICT 104 A', dayOfWeek: 2, startTime: '13:00', endTime: '14:30' },
      { facultyId: fortalezaId, subject: 'SPT 6 (SC BLIS 3-A)', room: 'TBA (LAB)', dayOfWeek: 2, startTime: '15:00', endTime: '17:00' },

      { facultyId: fortalezaId, subject: 'ICT 1 (SC BSCD 1-C)', room: 'ICT 101 A', dayOfWeek: 3, startTime: '08:00', endTime: '10:00' },
      { facultyId: fortalezaId, subject: 'SPT 6 (SC BLIS 3-A)', room: 'TBA', dayOfWeek: 3, startTime: '10:00', endTime: '11:00' },
      { facultyId: fortalezaId, subject: 'LICT 3 (SC BLIS 2-A)', room: 'ICT 309 (LAB)', dayOfWeek: 3, startTime: '13:00', endTime: '14:30' },
      { facultyId: fortalezaId, subject: 'ELECT 2 (SC BSISM 3-C)', room: 'IICT 104 A', dayOfWeek: 3, startTime: '14:30', endTime: '15:30' },
      { facultyId: fortalezaId, subject: 'ISM 6 (SC BSISM 1-A)', room: 'IICT 101 A', dayOfWeek: 3, startTime: '16:00', endTime: '17:00' },

      { facultyId: fortalezaId, subject: 'LICT 3 (SC BLIS 2-B)', room: 'ICT 301 (LAB)', dayOfWeek: 4, startTime: '09:00', endTime: '11:30' },
      { facultyId: fortalezaId, subject: 'ELECT 2 (SC BSISM 3-C)', room: 'IICT 104 A', dayOfWeek: 4, startTime: '13:00', endTime: '14:30' },
      { facultyId: fortalezaId, subject: 'LIS 11 (SC BLIS 3-A)', room: 'ICT 301 (LAB)', dayOfWeek: 4, startTime: '15:00', endTime: '17:00' },

      { facultyId: fortalezaId, subject: 'ICT 1 (SC BSCD 1-C)', room: 'ICT 101 A', dayOfWeek: 5, startTime: '08:30', endTime: '10:30' },
      { facultyId: fortalezaId, subject: 'LICT 3 (SC BLIS 2-A)', room: 'ICT 309 (LAB)', dayOfWeek: 5, startTime: '13:00', endTime: '15:00' },
      { facultyId: fortalezaId, subject: 'ISM 6 (SC BSISM 1-A)', room: 'IICT 101 A', dayOfWeek: 5, startTime: '16:00', endTime: '17:00' },

      // Carl Spence D. Percy — Faculty Individual Load, effectivity March 9, 2026
      { facultyId: percyId, subject: 'INFOT 8 - Platform Technologies (BSIT 3-D)', room: 'IICT 306', dayOfWeek: 1, startTime: '11:30', endTime: '12:30' },
      { facultyId: percyId, subject: 'INFOT 8 - Platform Technologies (BSIT 3-B)', room: 'IICT 307', dayOfWeek: 1, startTime: '13:30', endTime: '14:30' },
      { facultyId: percyId, subject: 'INFOE 4 (MMT) - Videography in Multimedia (BSIT 3-D)', room: 'IICT 304', dayOfWeek: 1, startTime: '15:30', endTime: '16:30' },

      { facultyId: percyId, subject: 'INFOT 8 - Platform Technologies (BSIT 3-D)', room: 'IICT 307', dayOfWeek: 2, startTime: '14:30', endTime: '16:00' },
      { facultyId: percyId, subject: 'INFOE 4 (MMT) - Videography in Multimedia (BSIT 3-D)', room: 'IICT 304', dayOfWeek: 2, startTime: '16:00', endTime: '17:00' },

      { facultyId: percyId, subject: 'INFOT 8 - Platform Technologies (BSIT 3-D)', room: 'IICT 308', dayOfWeek: 3, startTime: '11:00', endTime: '12:00' },
      { facultyId: percyId, subject: 'INFOT 8 - Platform Technologies (BSIT 3-B)', room: 'IICT 307', dayOfWeek: 3, startTime: '13:00', endTime: '14:00' },
      { facultyId: percyId, subject: 'INFOT 8 - Platform Technologies (BSIT 3-B)', room: 'IICT 108', dayOfWeek: 3, startTime: '14:00', endTime: '15:00' },
      { facultyId: percyId, subject: 'INFOE 4 (MMT) - Videography in Multimedia (BSIT 3-D)', room: 'IICT 304', dayOfWeek: 3, startTime: '16:00', endTime: '17:00' },

      { facultyId: percyId, subject: 'INFOT 8 - Platform Technologies (BSIT 3-D)', room: 'IICT 307', dayOfWeek: 4, startTime: '14:30', endTime: '16:00' },
      { facultyId: percyId, subject: 'INFOE 4 (MMT) - Videography in Multimedia (BSIT 3-D)', room: 'IICT 304', dayOfWeek: 4, startTime: '16:00', endTime: '17:00' },

      { facultyId: percyId, subject: 'INFOT 8 - Platform Technologies (BSIT 3-B)', room: 'IICT 307', dayOfWeek: 5, startTime: '13:00', endTime: '14:00' },
      { facultyId: percyId, subject: 'INFOT 8 - Platform Technologies (BSIT 3-B)', room: 'IICT 108', dayOfWeek: 5, startTime: '14:00', endTime: '15:00' },
      { facultyId: percyId, subject: 'INFOE 4 (MMT) - Videography in Multimedia (BSIT 3-D)', room: 'IICT 304', dayOfWeek: 5, startTime: '16:00', endTime: '17:00' },
      // Sarah Mae R. Silva — Faculty Individual Load, 2nd Sem AY 2025-2026 (eff. Feb 2, 2026)
      ...silvaSchedule,
    ]);

    // Silva's consultation hours: Tue & Thu 12:30-2:30 PM (4 hrs/week)
    // Percy's consultation hours: Tue & Thu 9:00-11:00 AM
    await ConsultationHours.insertMany([
      { facultyId: silvaId, dayOfWeek: 2, startTime: '12:30', endTime: '14:30' },
      { facultyId: silvaId, dayOfWeek: 4, startTime: '12:30', endTime: '14:30' },
      { facultyId: percyId, dayOfWeek: 2, startTime: '09:00', endTime: '11:00' },
      { facultyId: percyId, dayOfWeek: 4, startTime: '09:00', endTime: '11:00' },
    ]);

    console.log('SUCCESS! Database is seeded with real CCIS data and encrypted credentials.');
    process.exit();
  } catch (error) {
    console.error('Seeding Error:', error);
    process.exit(1);
  }
};

seedDatabase();