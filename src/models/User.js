const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  clerkId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },
  phoneNumber: {
    type: String
  },
  role: {
    type: String,
    enum: ['content_creator', 'local_business', 'super_admin'],
    required: true,
    default: 'content_creator',
    index: true
  },
  profile: {
    name: {
      type: String,
      required: true
    },
    avatar: {
      type: String // URL
    }
  },
  isSuspended: {
    type: Boolean,
    default: false
  },
  suspensionReason: {
    type: String
  },
  suspendedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  suspendedAt: {
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
userSchema.pre('save', async function() {
  if (this.isModified() || this.isNew) {
    this.updatedAt = Date.now();
  }
});

// Indexes are defined on the fields above (unique: true / index: true)

const User = mongoose.model('User', userSchema);

module.exports = User;
