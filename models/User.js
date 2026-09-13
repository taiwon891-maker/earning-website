const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 0 },
  role: { type: String, default: 'user' },
  resetOTP: String,
  resetOTPExpires: Date
});

module.exports = mongoose.model('User', userSchema);
