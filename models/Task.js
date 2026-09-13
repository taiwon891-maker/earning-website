const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  type: { type: String, enum: ['math', 'qa', 'video'], required: true },
  question: String,
  correctAnswer: String,
  videoUrl: String,
  rewardPoints: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Task', taskSchema);
