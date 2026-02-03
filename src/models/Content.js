const mongoose = require('mongoose');

const contentSchema = new mongoose.Schema({
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
  type: {
    type: String,
    enum: ['photo', 'video'],
    required: true
  },
  fileUrl: {
    type: String,
    required: true // Cloudinary URL
  },
  thumbnailUrl: {
    type: String // for videos
  },
  caption: {
    type: String,
    maxlength: 200
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending',
    index: true
  },
  isPrivate: {
    type: Boolean,
    default: false // false = public, true = private
  },
  points: {
    type: Number,
    default: 0 // points awarded when accepted
  },
  rejectionReason: {
    type: String
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Pre-save middleware to update updatedAt field
contentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Compound indexes
contentSchema.index({ businessId: 1, status: 1 });
contentSchema.index({ creatorId: 1, status: 1 });
contentSchema.index({ businessId: 1, creatorId: 1 });

// Method to populate creator and business details
contentSchema.methods.populateDetails = async function() {
  await this.populate('creatorId', 'email profile.name profile.avatar role');
  await this.populate('businessId', 'businessName location logo category');
  return this;
};

const Content = mongoose.model('Content', contentSchema);

module.exports = Content;
