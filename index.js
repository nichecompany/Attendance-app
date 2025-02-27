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

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  position: { type: String, required: true },
  department: { type: String, required: true },
  hours: { type: String, default: null }  // New field for monthly hour limit (as a string)
});

const User = mongoose.model('User', userSchema);

// Register API (Updated with Hours Field)
app.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, position, department, hours } = req.body;

    if (!name || !email || !password || !position || !department) {
      return res.status(200).json({ status: false, message: 'All fields are required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(200).json({ status: false, message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: role || 'user',
      position,
      department,
      hours: hours || null  // Optional field
    });

    await newUser.save();

    res.status(201).json({
      status: true,
      message: 'User registered successfully'
    });

  } catch (error) {
    console.error('Registration Error:', error);
    res.status(200).json({ status: false, message: 'Server Error', error: error.message });
  }
});


app.post('/check-hours', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ status: false, message: 'User ID is required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ status: false, message: 'User not found' });
    }

    // Get the current month and year
    const currentDate = new Date();
    const month = currentDate.getMonth(); // 0-based index (0 = January)
    const year = currentDate.getFullYear();

    // Fetch attendance records for the current month
    const attendanceRecords = await Attendance.find({
      userId,
      date: {
        $gte: new Date(year, month, 1),  // Start of the month
        $lt: new Date(year, month + 1, 1) // Start of next month
      }
    });

    let totalRecordedHours = 0;

    // Sum up all recorded hours
    attendanceRecords.forEach(record => {
      record.records.forEach(session => {
        if (session.checkIn && session.checkOut) {
          const hoursWorked = (new Date(session.checkOut) - new Date(session.checkIn)) / (1000 * 60 * 60); // Convert ms to hours
          totalRecordedHours += hoursWorked;
        }
      });
    });

    const savedHours = user.hours ? parseFloat(user.hours) : null;

    let responseString;
    let redFlag = true;

    if (savedHours === null) {
      responseString = `${totalRecordedHours.toFixed(2)}/unlimited`;
    } else {
      responseString = `${totalRecordedHours.toFixed(2)}/${savedHours}`;
      redFlag = totalRecordedHours < savedHours;
    }

    res.status(200).json({
      status: true,
      hours_record: responseString,
      red: redFlag
    });

  } catch (error) {
    console.error('Check Hours Error:', error);
    res.status(500).json({ status: false, message: 'Server Error', error: error.message });
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

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1y' });
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
      checkOut: { type: Date },
      note: { type: String, default: ' ' } // Default empty string for note
    }
  ]
});

const Attendance = mongoose.model('Attendance', attendanceSchema);
// Attendance API (Check-in/Check-out)
app.post('/attendance', authenticateToken, async (req, res) => {
  try {
    const { attendanceStatus, note } = req.body;

    if (!attendanceStatus || !['check-in', 'check-out'].includes(attendanceStatus.toLowerCase())) {
      return res.status(200).json({ status: false, message: 'Invalid attendance status. Use "check-in" or "check-out".' });
    }

    const userId = req.user.id;
    const currentDate = new Date();
    const dateOnly = new Date(currentDate.toDateString());

    let attendance = await Attendance.findOne({ userId, date: dateOnly });

    if (!attendance) {
      attendance = new Attendance({ userId, date: dateOnly, records: [] });
    }

    if (attendanceStatus.toLowerCase() === 'check-in') {
      if (attendance.records.length > 0 && !attendance.records[attendance.records.length - 1].checkOut) {
        return res.status(200).json({
          status: false,
          message: 'You are still checked-in. Please check out before checking in again.',
          time: currentDate.toISOString()
        });
      }
      attendance.records.push({ checkIn: currentDate });
      await attendance.save();

      return res.status(200).json({
        status: true,
        message: 'Check-in recorded successfully.',
        time: currentDate.toISOString()
      });
    } else {
      if (!note || note.trim() === '') {
        return res.status(200).json({ status: false, message: 'Note is required for check-out.' });
      }
      if (attendance.records.length === 0 || attendance.records[attendance.records.length - 1].checkOut) {
        return res.status(200).json({
          status: false,
          message: 'You must check-in before checking out.',
          time: currentDate.toISOString()
        });
      }
      attendance.records[attendance.records.length - 1].checkOut = currentDate;
      attendance.records[attendance.records.length - 1].note = note;
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
    const { userId, month, year } = req.body;

    if (!userId || !month || !year) {
      return res.status(200).json({ status: false, message: 'User ID, month, and year are required.' });
    }

    const attendanceRecords = await Attendance.find({
      userId,
      date: {
        $gte: new Date(year, month - 1, 1),
        $lt: new Date(year, month, 1)
      }
    });

    let totalHours = 0;
    const detailedRecords = {};

    // Sort attendance records by date in descending order
    attendanceRecords.sort((a, b) => new Date(b.date) - new Date(a.date));

    attendanceRecords.forEach(record => {
      const dateStr = record.date.toISOString().split('T')[0]; // Format date as YYYY-MM-DD
      detailedRecords[dateStr] = [];

      record.records.forEach(session => {
        if (session.checkIn && session.checkOut) {
          const hoursWorked = (new Date(session.checkOut) - new Date(session.checkIn)) / (1000 * 60 * 60); // Calculate hours
          totalHours += hoursWorked;

          detailedRecords[dateStr].push({
            checkIn: session.checkIn,
            checkOut: session.checkOut,
            duration: hoursWorked.toFixed(2) + ' hours',
            note: session.note || ' '
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

// delete attendance 
// Delete Specific Attendance Session API
app.post('/delete-attendance-session', authenticateToken, async (req, res) => {
  try {
    const { checkIn, checkOut } = req.body;

    // Validate required fields
    if (!checkIn || !checkOut) {
      return res.status(200).json({ status: false, message: 'Both checkIn and checkOut timestamps are required.' });
    }

    const userId = req.user.id;

    // Find the attendance record containing the specified session
    const attendanceRecord = await Attendance.findOne({
      userId,
      'records.checkIn': new Date(checkIn),
      'records.checkOut': new Date(checkOut)
    });

    if (!attendanceRecord) {
      return res.status(200).json({ status: false, message: 'Attendance session not found.' });
    }

    // Filter out the session to be deleted
    attendanceRecord.records = attendanceRecord.records.filter(session => {
      return !(session.checkIn.getTime() === new Date(checkIn).getTime() && session.checkOut.getTime() === new Date(checkOut).getTime());
    });

    // If no records are left for the day, delete the entire attendance document
    if (attendanceRecord.records.length === 0) {
      await Attendance.findByIdAndDelete(attendanceRecord._id);
    } else {
      // Save the updated attendance record
      await attendanceRecord.save();
    }

    res.status(200).json({
      status: true,
      message: 'Attendance session deleted successfully.'
    });
  } catch (error) {
    console.error('Delete Attendance Session Error:', error);
    res.status(200).json({ status: false, message: 'Server Error', error: error.message });
  }
});
// add time attendance 

// all users
// Middleware to check if user is admin
const verifyAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(200).json({ status: false, message: 'Access denied. Admins only.' });
  }
  next();
};
// 
app.post('/add-attendance-session', authenticateToken, async (req, res) => {
  try {
    const { checkIn, checkOut, note } = req.body;

    // Validate input fields
    if (!checkIn || !checkOut || !note) {
      return res.status(200).json({ status: false, message: 'Check-in, check-out, and note are required.' });
    }

    const userId = req.user.id;
    const dateOnly = new Date(new Date(checkIn).toDateString());

    // Find or create attendance record for the given date
    let attendanceRecord = await Attendance.findOne({ userId, date: dateOnly });

    if (!attendanceRecord) {
      attendanceRecord = new Attendance({ userId, date: dateOnly, records: [] });
    }

    // Add the manually created session
    attendanceRecord.records.push({
      checkIn: new Date(checkIn),
      checkOut: new Date(checkOut),
      note: `Manually by user: ${note}`
    });

    await attendanceRecord.save();

    res.status(200).json({
      status: true,
      message: 'Attendance session added manually successfully.'
    });
  } catch (error) {
    console.error('Add Attendance Session Error:', error);
    res.status(200).json({ status: false, message: 'Server Error', error: error.message });
  }
});
// tasks :
// Task Management Schema
const taskSchema = new mongoose.Schema({
  taskName: { type: String, required: true },
  description: { type: String, required: true },
  deadline: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  achievedBy: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    achievedAt: { type: Date }
  }],
  notes: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: { type: String },
    timeAdded: { type: Date, default: Date.now }
  }]
});

const Task = mongoose.model('Task', taskSchema);

// 1. Add Task API
// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ status: false, message: 'Access denied. Admins only.' });
  }
  next();
};

// 1. Add Task (Admin Only)
app.post('/add-task', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { taskName, description, deadline, assignedTo } = req.body;

    if (!taskName || !description || !deadline || !assignedTo || assignedTo.length === 0) {
      return res.status(200).json({ status: false, message: 'All fields are required and at least one user must be assigned.' });
    }

    const newTask = new Task({
      taskName,
      description,
      deadline: new Date(deadline),
      createdBy: req.user.id,
      assignedTo: assignedTo.map(id => mongoose.Types.ObjectId(id)) // Ensure ObjectId format
    });

    await newTask.save();
    res.status(201).json({ status: true, message: 'Task created successfully.' });
  } catch (error) {
    console.error('Add Task Error:', error);
    res.status(200).json({ status: false, message: 'Server Error', error: error.message });
  }
});

// 2. Achieve Task (Only Assigned Users)
app.post('/achieve-task', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.body;
    const userId = mongoose.Types.ObjectId(req.user.id);

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(200).json({ status: false, message: 'Task not found.' });
    }

    if (!task.assignedTo.some(id => id.equals(userId))) {
      return res.status(200).json({ status: false, message: 'You are not assigned to this task.' });
    }

    if (task.achievedBy.some(entry => entry.userId.equals(userId))) {
      return res.status(200).json({ status: false, message: 'Task already achieved.' });
    }

    task.achievedBy.push({ userId, achievedAt: new Date() });
    await task.save();

    res.status(200).json({ status: true, message: 'Task marked as achieved.' });
  } catch (error) {
    console.error('Achieve Task Error:', error);
    res.status(200).json({ status: false, message: 'Server Error', error: error.message });
  }
});

// 3. Delete Task (Admin Only)
app.post('/delete-task', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { taskId } = req.body;
    const task = await Task.findByIdAndDelete(taskId);
    if (!task) {
      return res.status(200).json({ status: false, message: 'Task not found.' });
    }

    res.status(200).json({ status: true, message: 'Task deleted successfully.' });
  } catch (error) {
    console.error('Delete Task Error:', error);
    res.status(200).json({ status: false, message: 'Server Error', error: error.message });
  }
});

// 4. Add Task Note (Admin or Assigned Users)
app.post('/add-task-note', authenticateToken, async (req, res) => {
  try {
    const { taskId, note } = req.body;

    if (!taskId || !note) {
      return res.status(200).json({ status: false, message: 'Task ID and note are required.' });
    }

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(200).json({ status: false, message: 'Task not found.' });
    }

    if (!req.user.isAdmin && !task.assignedTo.some(id => id.equals(req.user.id))) {
      return res.status(403).json({ status: false, message: 'Access denied. Only assigned users or admins can add notes.' });
    }

    task.notes.push({ userId: req.user.id, note, timeAdded: new Date() });
    await task.save();

    res.status(200).json({ status: true, message: 'Note added to task successfully.' });
  } catch (error) {
    console.error('Add Task Note Error:', error);
    res.status(200).json({ status: false, message: 'Server Error', error: error.message });
  }
});

// 5. Fetch Achieved and Pending Tasks
app.get('/tasks-summary', authenticateToken, async (req, res) => {
  try {
    let achievedTasks, pendingTasks;
    if (req.user.isAdmin) {
      achievedTasks = await Task.find({ 'achievedBy.0': { $exists: true } }).sort({ createdAt: -1 });
      pendingTasks = await Task.find({ 'achievedBy.0': { $exists: false } }).sort({ createdAt: -1 });
    } else {
      achievedTasks = await Task.find({ assignedTo: req.user.id, 'achievedBy.userId': req.user.id }).sort({ createdAt: -1 });
      pendingTasks = await Task.find({ assignedTo: req.user.id, 'achievedBy.0': { $exists: false } }).sort({ createdAt: -1 });
    }

    res.status(200).json({ status: true, message: 'Tasks summary fetched successfully.', achievedTasks, pendingTasks });
  } catch (error) {
    console.error('Fetch Tasks Summary Error:', error);
    res.status(200).json({ status: false, message: 'Server Error', error: error.message });
  }
});

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
// TODO delete the user 
// Delete User API (Admin Only)
app.post('/delete-user', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.body; // Get user ID from request body

    if (!userId) {
      return res.status(200).json({ status: false, message: 'User ID is required.' });
    }

    // Check if the user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(200).json({ status: false, message: 'User not found.' });
    }

    // Delete the user from the database
    await User.findByIdAndDelete(userId);

    // Delete all attendance records related to the user
    await Attendance.deleteMany({ userId });

    res.status(200).json({
      status: true,
      message: `User ${user.name} and all related data have been deleted successfully.`,
    });

  } catch (error) {
    console.error('Delete User Error:', error);
    res.status(200).json({ status: false, message: 'Server Error', error: error.message });
  }
});
// TODO role :
app.post('/change-role', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { userId, newRole } = req.body;

    // Validate input
    if (!userId || !newRole) {
      return res.status(400).json({ status: false, message: 'User ID and new role are required.' });
    }

    // Ensure the role is either 'admin' or 'user'
    if (!['admin', 'user'].includes(newRole)) {
      return res.status(400).json({ status: false, message: 'Invalid role. Use "admin" or "user".' });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ status: false, message: 'User not found.' });
    }

    // Prevent self-role change (Optional: Admins cannot change their own role)
    if (userId === req.user.id) {
      return res.status(403).json({ status: false, message: 'You cannot change your own role.' });
    }

    // Update role
    user.role = newRole;
    await user.save();

    res.status(200).json({
      status: true,
      message: `User ${user.name} role updated to ${newRole} successfully.`,
    });

  } catch (error) {
    console.error('Change Role Error:', error);
    res.status(200).json({ status: false, message: 'Server Error', error: error.message });
  }
});


//! testing the server
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
