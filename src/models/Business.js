const mongoose = require('mongoose');

const businessSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  businessName: {
    type: String,
    required: true,
    trim: true
  },
  location: {
    type: {
      type: String,
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: function(v) {
          return v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number';
        },
        message: 'Coordinates must be an array of [longitude, latitude]'
      }
    },
    address: {
      type: String,
      required: true
    },
    city: {
      type: String,
      required: true
    },
    country: {
      type: String,
      required: true
    }
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  description: {
    type: String
  },
  logo: {
    type: String // URL
  },
  contactInfo: {
    email: {
      type: String
    },
    phone: {
      type: String
    }
  },
  contentSettings: {
    acceptsPhoto: {
      type: Boolean,
      default: true
    },
    acceptsVideo: {
      type: Boolean,
      default: true
    },
    pointsPerPhoto: {
      type: Number,
      default: 10,
      min: 1,
      max: 100
    },
    pointsPerVideo: {
      type: Number,
      default: 20,
      min: 1,
      max: 200
    }
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  verifiedAt: {
    type: Date
  },
  milestones: [{
    points: {
      type: Number,
      required: true,
      min: 1
    },
    rewardTitle: {
      type: String,
      required: true
    },
    rewardDescription: {
      type: String,
      required: true
    },
    termsAndConditions: {
      type: String
    }
  }],
  totalContentReceived: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'suspended'],
    default: 'active'
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
businessSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Geospatial index on location field for proximity searches
businessSchema.index({ location: '2dsphere' });

const Business = mongoose.model('Business', businessSchema);

module.exports = Business;
