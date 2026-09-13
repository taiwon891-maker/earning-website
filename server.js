require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const User = require('./models/User');
const Task = require('./models/Task');
const Withdrawal = require('./models/Withdrawal');

const app = express();
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

const JWT_SECRET = process.env.JWT_SECRET || 'secretkey123';

// Database Connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/earningDB')
  .then(() => console.log('MongoDB Connected Successfully'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// Email Transporter Setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Auth Middlewares
const auth = async (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.redirect('/login');
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = await User.findById(verified.id);
    if (!req.user) return res.redirect('/login');
    next();
  } catch {
    res.clearCookie('token');
    res.redirect('/login');
  }
};

const adminAuth = (req, res, next) => {
  if (req.user && req.user.role === 'admin') next();
  else res.status(403).send('Access Denied: Admin privileges required');
};

// --- AUTHENTICATION ROUTES ---

app.get('/login', (req, res) => res.render('login'));

app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).send('User exists! <a href="/login">Login</a>');
    
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ username, password: hashedPassword });
    res.send('Registration successful! <a href="/login">Click to Login</a>');
  } catch (err) {
    res.status(500).send('Registration failed');
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (user && await bcrypt.compare(password, user.password)) {
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true }).redirect('/');
  } else {
    res.status(400).send('Invalid credentials! <a href="/login">Try again</a>');
  }
});

app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login');
});

// --- PASSWORD RESET ROUTES ---

app.get('/forgot-password', (req, res) => res.render('forgot-password'));

app.post('/send-otp', async (req, res) => {
  const { username } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.status(404).send('User not found. <a href="/forgot-password">Try again</a>');

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  user.resetOTP = otp;
  user.resetOTPExpires = Date.now() + 10 * 60 * 1000;
  await user.save();

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: username,
      subject: 'Password Reset OTP Code',
      text: `Your OTP Code is: ${otp}. Valid for 10 minutes.`
    });
    res.send('OTP Sent to email! <a href="/reset-password">Reset Password</a>');
  } catch {
    res.status(500).send('Email send failed. Verify your SMTP environment settings.');
  }
});

app.get('/reset-password', (req, res) => res.render('reset-password'));

app.post('/reset-password', async (req, res) => {
  const { username, otp, newPassword } = req.body;
  const user = await User.findOne({
    username,
    resetOTP: otp,
    resetOTPExpires: { $gt: Date.now() }
  });

  if (!user) return res.status(400).send('Invalid or expired OTP. <a href="/forgot-password">Retry</a>');

  user.password = await bcrypt.hash(newPassword, 10);
  user.resetOTP = undefined;
  user.resetOTPExpires = undefined;
  await user.save();

  res.send('Password reset complete! <a href="/login">Login now</a>');
});

// --- USER DASHBOARD & EARNINGS ROUTES ---

app.get('/', auth, async (req, res) => {
  const withdrawals = await Withdrawal.find({ userId: req.user._id }).sort({ createdAt: -1 });
  res.render('index', { user: req.user, withdrawals });
});

app.get('/earnings', auth, async (req, res) => {
  const tasks = await Task.find().sort({ createdAt: -1 });
  res.render('earnings', { user: req.user, tasks });
});

app.post('/earn/complete-task', auth, async (req, res) => {
  const { taskId, userAnswer } = req.body;
  const task = await Task.findById(taskId);

  if (!task) return res.json({ success: false, message: 'Task not found' });

  if (task.type === 'math' || task.type === 'qa') {
    if (!userAnswer || userAnswer.toString().trim().toLowerCase() !== task.correctAnswer.toString().trim().toLowerCase()) {
      return res.json({ success: false, message: 'Incorrect Answer!' });
    }
  }

  req.user.balance += task.rewardPoints;
  await req.user.save();

  res.json({
    success: true,
    message: `Earned ${task.rewardPoints} points!`,
    newBalance: req.user.balance
  });
});

app.post('/withdraw', auth, async (req, res) => {
  const { method, accountNumber, amount } = req.body;
  const reqAmount = Number(amount);
  if (req.user.balance >= reqAmount && reqAmount > 0) {
    req.user.balance -= reqAmount;
    await req.user.save();
    await Withdrawal.create({
      userId: req.user._id,
      username: req.user.username,
      method,
      accountNumber,
      amount: reqAmount
    });
  }
  res.redirect('/');
});

// --- ADMIN PANEL ROUTES ---

app.get('/admin', auth, adminAuth, async (req, res) => {
  const requests = await Withdrawal.find().sort({ createdAt: -1 });
  const tasks = await Task.find().sort({ createdAt: -1 });
  res.render('admin', { requests, tasks });
});

app.post('/admin/add-task', auth, adminAuth, async (req, res) => {
  const { title, type, question, correctAnswer, videoUrl, rewardPoints } = req.body;
  await Task.create({
    title, type, question, correctAnswer, videoUrl, rewardPoints: Number(rewardPoints)
  });
  res.redirect('/admin');
});

app.post('/admin/delete-task/:id', auth, adminAuth, async (req, res) => {
  await Task.findByIdAndDelete(req.params.id);
  res.redirect('/admin');
});

app.post('/admin/approve/:id', auth, adminAuth, async (req, res) => {
  await Withdrawal.findByIdAndUpdate(req.params.id, { status: 'Approved' });
  res.redirect('/admin');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  
