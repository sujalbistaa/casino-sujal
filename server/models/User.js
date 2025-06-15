const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  nickname: {
    type: String,
    required: [true, 'Nickname is required'],
    unique: true,
    trim: true,
    minlength: [2, 'Nickname must be at least 2 characters'],
    maxlength: [20, 'Nickname cannot exceed 20 characters'],
    match: [/^[a-zA-Z0-9_-]+$/, 'Nickname can only contain letters, numbers, underscores, and hyphens']
  },
  balance: {
    type: Number,
    default: 1000,
    min: [0, 'Balance cannot be negative']
  },
  totalWinnings: {
    type: Number,
    default: 0
  },
  totalLosses: {
    type: Number,
    default: 0
  },
  gamesPlayed: {
    type: Number,
    default: 0
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for faster nickname lookups
userSchema.index({ nickname: 1 });

// Virtual for win rate
userSchema.virtual('winRate').get(function() {
  if (this.gamesPlayed === 0) return 0;
  return ((this.totalWinnings / (this.totalWinnings + this.totalLosses)) * 100).toFixed(2);
});

// Include virtuals when converting to JSON
userSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('CasinoUser', userSchema);