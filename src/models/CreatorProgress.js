const mongoose = require('mongoose');

const creatorProgressSchema = new mongoose.Schema({
  creatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  totalPoints: {
    type: Number,
    default: 0,
    min: 0
  },
  contentSubmitted: {
    type: Number,
    default: 0
  },
  contentAccepted: {
    type: Number,
    default: 0
  },
  contentRejected: {
    type: Number,
    default: 0
  },
  milestonesAchieved: [{
    milestoneIndex: {
      type: Number,
      required: true // index in business.milestones array
    },
    achievedAt: {
      type: Date,
      default: Date.now
    },
    redeemed: {
      type: Boolean,
      default: false
    },
    redeemedAt: {
      type: Date
    }
  }],
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Pre-save middleware to update updatedAt field
creatorProgressSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Compound unique index on creatorId + businessId
creatorProgressSchema.index({ creatorId: 1, businessId: 1 }, { unique: true });

// Method to calculate acceptance rate
creatorProgressSchema.methods.calculateAcceptanceRate = function() {
  if (this.contentSubmitted === 0) {
    return 0;
  }
  return (this.contentAccepted / this.contentSubmitted) * 100;
};

const CreatorProgress = mongoose.model('CreatorProgress', creatorProgressSchema);

module.exports = CreatorProgress;
