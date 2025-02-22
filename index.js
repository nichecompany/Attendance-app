// Import required packages
const express = require('express');
const app = express(); 
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();



// Start Server
const PORT = process.env.PORT || 8000;

app.use(express.json()); // Built-in body parser
app.use(bodyParser.urlencoded({ extended: true }));
const corsOptions = {
  origin: '*', // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'month', 'year'],
};

app.use(cors(corsOptions));
//! tokens
// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  console.log("Received Token:", token); // Debugging token

  if (!token) {
    console.log("No token found");
    return res.status(200).json({ status: false, message: 'Access denied. No token provided.' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.log("Token verification failed", err);
      return res.status(200).json({ status: false, message: 'Invalid token.' });
    }
    req.user = user;
    console.log("Token valid, User:", user); // Debug
    next();
  });
};



// MongoDB Connection
mongoose.connect('mongodb+srv://Niche:niche_co_dev2025@cluster0.cobgn.mongodb.net/attendanceApp?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB Atlas successfully'))
.catch(err => console.error('MongoDB connection error:', err));

// User Schema
// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  position: { type: String, required: true },  // New field for position
  department: { type: String, required: true } // New field for department
});

const User = mongoose.model('User', userSchema);

// Register API
// Register API (Updated with Token)
app.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, position, department } = req.body;

    // Validate required fields
    if (!name || !email || !password || !position || !department) {
      return res.status(200).json({ status: false, message: 'All fields are required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(200).json({ status: false, message: 'User already exists' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: role || 'user',
      position,
      department
    });

    // Save the new user to the database
    await newUser.save();

    // Respond without generating a token
    res.status(201).json({
      status: true,
      message: 'User registered successfully'
    });

  } catch (error) {
    console.error('Registration Error:', error);
    res.status(200).json({ status: false, message: 'Server Error', error: error.message });
  }
});



// Login API
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(200).json({ status: false, statusCode: 200, message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(200).json({ status: false, statusCode: 200, message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(200).json({ status: false, statusCode: 200, message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '48h' });
    res.status(200).json({
      status: true,
      statusCode: 200,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        position: user.position, // Return position
        department: user.department // Return department
      }
    });
  } catch (error) {
    console.error('Login Error:', error); // Log detailed error in console
    res.status(200).json({ status: false, statusCode: 200, message: 'Server Error', error: error.message });
  }
});

// Change Password API
app.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(200).json({ status: false, message: 'Old and new passwords are required.' });
    }

    // Find the user using the ID from the decoded token
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(200).json({ status: false, message: 'User not found.' });
    }

    // Verify the old password
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(200).json({ status: false, message: 'Old password is incorrect.' });
    }

    // Hash the new password and update it
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedNewPassword;
    await user.save();

    res.status(200).json({ status: true, message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Change Password Error:', error);
    res.status(200).json({ status: false, message: 'Server Error', error: error.message });
  }
});
// get profile 
// Get User Profile API
app.get('/profile', authenticateToken, async (req, res) => {
  try {
    // Find the user using the ID from the decoded token
    const user = await User.findById(req.user.id).select('-password'); // Exclude the password

    if (!user) {
      return res.status(200).json({ status: false, message: 'User not found.' });
    }

    res.status(200).json({
      status: true,
      message: 'User profile retrieved successfully.',
      user
    });
  } catch (error) {
    console.error('Get Profile Error:', error);
    res.status(200).json({ status: false, message: 'Server Error', error: error.message });
  }
});

// attendance :
// Attendance Schema
const attendanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  records: [
    {
      checkIn: { type: Date },
      checkOut: { type: Date }
    }
  ]
});

const Attendance = mongoose.model('Attendance', attendanceSchema);
// Attendance API (Check-in/Check-out)
app.post('/attendance', authenticateToken, async (req, res) => {
  try {
    const { attendanceStatus } = req.body;

    if (!attendanceStatus || !['check-in', 'check-out'].includes(attendanceStatus.toLowerCase())) {
      return res.status(200).json({ status: false, message: 'Invalid attendance status. Use "check-in" or "check-out".' });
    }

    const userId = req.user.id;
    const currentDate = new Date();
    const dateOnly = new Date(currentDate.toDateString()); // Normalize to remove time

    let attendance = await Attendance.findOne({ userId, date: dateOnly });

    // If no attendance record exists for today, create one
    if (!attendance) {
      attendance = new Attendance({ userId, date: dateOnly, records: [] });
    }

    if (attendanceStatus.toLowerCase() === 'check-in') {
      // Prevent multiple consecutive check-ins without a check-out
      if (
        attendance.records.length > 0 &&
        !attendance.records[attendance.records.length - 1].checkOut
      ) {
        return res.status(200).json({
          status: false,
          message: 'You are still checked-in. Please check out before checking in again.',
          time: currentDate.toISOString()
        });
      }

      // Add a new check-in record
      attendance.records.push({ checkIn: currentDate });
      await attendance.save();

      return res.status(200).json({
        status: true,
        message: 'Check-in recorded successfully.',
        time: currentDate.toISOString()
      });
    } else {
      // Prevent check-out without a prior check-in
      if (attendance.records.length === 0 || attendance.records[attendance.records.length - 1].checkOut) {
        return res.status(200).json({
          status: false,
          message: 'You must check-in before checking out.',
          time: currentDate.toISOString()
        });
      }

      // Add a check-out time to the latest check-in record
      attendance.records[attendance.records.length - 1].checkOut = currentDate;
      await attendance.save();

      return res.status(200).json({
        status: true,
        message: 'Check-out recorded successfully.',
        time: currentDate.toISOString()
      });
    }
  } catch (error) {
    console.error('Attendance Error:', error);
    res.status(200).json({ status: false, message: 'Server Error', error: error.message });
  }
});

// API to Get Attendance by User ID for Month and Year
app.post('/attendance-summary', authenticateToken, async (req, res) => {
  try {
    const { userId, month, year } = req.body; // Extract directly from the body

    if (!userId || !month || !year) {
      return res.status(200).json({ status: false, message: 'User ID, month, and year are required.' });
    }

    // Fetch attendance data for the specific month and year
    const attendanceRecords = await Attendance.find({
      userId,
      date: {
        $gte: new Date(year, month - 1, 1),
        $lt: new Date(year, month, 1)
      }
    });

    let totalHours = 0;
    const detailedRecords = {};

    attendanceRecords.forEach(record => {
      const dateStr = record.date.toISOString().split('T')[0]; // Format: YYYY-MM-DD
      detailedRecords[dateStr] = [];

      record.records.forEach(session => {
        if (session.checkIn && session.checkOut) {
          const hoursWorked = (new Date(session.checkOut) - new Date(session.checkIn)) / (1000 * 60 * 60); // Convert ms to hours
          totalHours += hoursWorked;

          detailedRecords[dateStr].push({
            checkIn: session.checkIn,
            checkOut: session.checkOut,
            duration: hoursWorked.toFixed(2) + ' hours'
          });
        }
      });
    });

    res.status(200).json({
      status: true,
      message: 'Attendance retrieved successfully.',
      totalWorkingHours: totalHours.toFixed(2),
      attendanceDetails: detailedRecords
    });
  } catch (error) {
    console.error('Attendance Summary Error:', error);
    res.status(200).json({ status: false, message: 'Server Error', error: error.message });
  }
});
// all users
// Middleware to check if user is admin
const verifyAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(200).json({ status: false, message: 'Access denied. Admins only.' });
  }
  next();
};

// API to get all users with total working hours of the current month
app.get('/users', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    // Get current month and year
    const currentDate = new Date();
    const month = currentDate.getMonth(); // 0-based index (0 = January)
    const year = currentDate.getFullYear();

    // Fetch all users
    const users = await User.find({}, '_id name email');

    // Initialize result array
    const userSummaries = [];

    for (const user of users) {
      // Fetch user's attendance for the current month
      const attendanceRecords = await Attendance.find({
        userId: user._id,
        date: {
          $gte: new Date(year, month, 1),
          $lt: new Date(year, month + 1, 1)
        }
      });

      // Calculate total working hours for the month
      let totalHours = 0;

      attendanceRecords.forEach(record => {
        record.records.forEach(session => {
          if (session.checkIn && session.checkOut) {
            const hoursWorked = (new Date(session.checkOut) - new Date(session.checkIn)) / (1000 * 60 * 60);
            totalHours += hoursWorked;
          }
        });
      });

      userSummaries.push({
        id: user._id,
        name: user.name,
        email: user.email,
        totalWorkingHours: totalHours.toFixed(2) // Round to 2 decimal places
      });
    }

    res.status(200).json({
      status: true,
      message: 'User data retrieved successfully.',
      users: userSummaries
    });
  } catch (error) {
    console.error('Get Users Error:', error);
    res.status(200).json({ status: false, message: 'Server Error', error: error.message });
  }
});
app.get('/test', (req, res) => {
  res.send('working');
});
app.get('/check-token', (req, res) => {
  res.send(`JWT_SECRET is: ${process.env.JWT_SECRET || 'Not set'}`);
});
// MongoDB Connection Status API
app.get('/db-status', async (req, res) => {
  try {
    const connectionState = mongoose.connection.readyState;

    let status = '';
    switch (connectionState) {
      case 0:
        status = 'Disconnected';
        break;
      case 1:
        status = 'Connected';
        break;
      case 2:
        status = 'Connecting';
        break;
      case 3:
        status = 'Disconnecting';
        break;
      default:
        status = 'Unknown';
        break;
    }

    res.status(200).json({
      status: true,
      message: `MongoDB connection status: ${status}`,
    });
  } catch (error) {
    console.error('Database Status Error:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to retrieve database connection status',
      error: error.message,
    });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
