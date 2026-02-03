const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Business = require('../models/Business');
const Category = require('../models/Category');
const Content = require('../models/Content');
const CreatorProgress = require('../models/CreatorProgress');
const User = require('../models/User');

/**
 * Validation rules for business registration
 */
const validateBusinessRegistration = [
  body('businessName')
    .trim()
    .notEmpty()
    .withMessage('Business name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Business name must be between 2 and 100 characters'),
  
  body('address')
    .trim()
    .notEmpty()
    .withMessage('Address is required')
    .isLength({ min: 5, max: 200 })
    .withMessage('Address must be between 5 and 200 characters'),
  
  body('city')
    .trim()
    .notEmpty()
    .withMessage('City is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('City must be between 2 and 100 characters'),
  
  body('country')
    .trim()
    .notEmpty()
    .withMessage('Country is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Country must be between 2 and 100 characters'),
  
  body('latitude')
    .notEmpty()
    .withMessage('Latitude is required')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be a valid number between -90 and 90')
    .toFloat(),
  
  body('longitude')
    .notEmpty()
    .withMessage('Longitude is required')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be a valid number between -180 and 180')
    .toFloat(),
  
  body('category')
    .notEmpty()
    .withMessage('Category is required')
    .isMongoId()
    .withMessage('Category must be a valid MongoDB ObjectId'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must not exceed 1000 characters'),
  
  body('logo')
    .optional()
    .trim()
    .isURL()
    .withMessage('Logo must be a valid URL'),
  
  body('contactInfo.email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Contact email must be a valid email address')
    .normalizeEmail(),
  
  body('contactInfo.phone')
    .optional()
    .trim()
    .isLength({ min: 10, max: 20 })
    .withMessage('Contact phone must be between 10 and 20 characters')
];

/**
 * Validation rules for content settings update
 */
const validateContentSettings = [
  body('acceptsPhoto')
    .optional()
    .isBoolean()
    .withMessage('acceptsPhoto must be a boolean value'),
  
  body('acceptsVideo')
    .optional()
    .isBoolean()
    .withMessage('acceptsVideo must be a boolean value'),
  
  body('pointsPerPhoto')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('pointsPerPhoto must be an integer between 1 and 100')
    .toInt(),
  
  body('pointsPerVideo')
    .optional()
    .isInt({ min: 1, max: 200 })
    .withMessage('pointsPerVideo must be an integer between 1 and 200')
    .toInt()
];

/**
 * Validation rules for milestone creation
 */
const validateMilestone = [
  body('points')
    .notEmpty()
    .withMessage('Points is required')
    .isInt({ min: 1 })
    .withMessage('Points must be an integer greater than 0')
    .toInt(),
  
  body('rewardTitle')
    .trim()
    .notEmpty()
    .withMessage('Reward title is required')
    .isLength({ min: 1, max: 200 })
    .withMessage('Reward title must be between 1 and 200 characters'),
  
  body('rewardDescription')
    .trim()
    .notEmpty()
    .withMessage('Reward description is required')
    .isLength({ min: 1, max: 1000 })
    .withMessage('Reward description must be between 1 and 1000 characters'),
  
  body('termsAndConditions')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Terms and conditions must not exceed 2000 characters')
];

/**
 * POST /api/business/register
 * Register a new business
 * Requires: local_business role (enforced by middleware)
 */
const registerBusiness = async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid input data',
        details: errors.array()
      });
    }

    // Ensure user is authenticated (should be set by verifyClerkToken middleware)
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated. Please authenticate first.'
      });
    }

    // Check if user already has a business
    const existingBusiness = await Business.findOne({ userId: req.user._id });
    if (existingBusiness) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'User already has a registered business. Each user can only have one business.'
      });
    }

    // Verify that the category exists
    const category = await Category.findById(req.body.category);
    if (!category) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Category not found. Please provide a valid category ID.'
      });
    }

    // Extract and prepare business data
    const {
      businessName,
      address,
      city,
      country,
      latitude,
      longitude,
      category: categoryId,
      description,
      logo,
      contactInfo
    } = req.body;

    // Create business object
    const businessData = {
      userId: req.user._id,
      businessName: businessName.trim(),
      location: {
        type: 'Point',
        coordinates: [longitude, latitude], // [longitude, latitude] as per GeoJSON spec
        address: address.trim(),
        city: city.trim(),
        country: country.trim()
      },
      category: categoryId,
      status: 'active',
      isVerified: false,
      contentSettings: {
        acceptsPhoto: true,
        acceptsVideo: true,
        pointsPerPhoto: 10,
        pointsPerVideo: 20
      }
    };

    // Add optional fields if provided
    if (description) {
      businessData.description = description.trim();
    }

    if (logo) {
      businessData.logo = logo.trim();
    }

    if (contactInfo) {
      businessData.contactInfo = {};
      if (contactInfo.email) {
        businessData.contactInfo.email = contactInfo.email.trim();
      }
      if (contactInfo.phone) {
        businessData.contactInfo.phone = contactInfo.phone.trim();
      }
    }

    // Create and save business
    const business = new Business(businessData);
    await business.save();

    // Populate category for response
    await business.populate('category', 'name description icon');

    return res.status(201).json({
      message: 'Business registered successfully',
      business
    });
  } catch (error) {
    console.error('Error in registerBusiness:', error);

    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Business with this information already exists.',
        details: error.message
      });
    }

    // Handle validation errors from Mongoose
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));

      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid business data',
        details: validationErrors
      });
    }

    // Handle cast errors (invalid ObjectId, etc.)
    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid data format',
        details: error.message
      });
    }

    // Generic error handler
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to register business.',
      details: error.message
    });
  }
};

/**
 * PATCH /api/business/content-settings
 * Update content settings for business
 * Requires: local_business role (enforced by middleware)
 */
const updateContentSettings = async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid input data',
        details: errors.array()
      });
    }

    // Ensure user is authenticated
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated. Please authenticate first.'
      });
    }

    // Find business owned by user
    const business = await Business.findOne({ userId: req.user._id });
    
    if (!business) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Business not found. Please register a business first.'
      });
    }

    // Check if business is verified
    if (!business.isVerified) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Business must be verified before updating content settings. Please wait for verification.'
      });
    }

    // Extract content settings from request body
    const {
      acceptsPhoto,
      acceptsVideo,
      pointsPerPhoto,
      pointsPerVideo
    } = req.body;

    // Update content settings fields if provided
    if (acceptsPhoto !== undefined) {
      business.contentSettings.acceptsPhoto = acceptsPhoto;
    }

    if (acceptsVideo !== undefined) {
      business.contentSettings.acceptsVideo = acceptsVideo;
    }

    if (pointsPerPhoto !== undefined) {
      business.contentSettings.pointsPerPhoto = pointsPerPhoto;
    }

    if (pointsPerVideo !== undefined) {
      business.contentSettings.pointsPerVideo = pointsPerVideo;
    }

    // Validate that at least one content type must be accepted
    if (business.contentSettings.acceptsPhoto === false && 
        business.contentSettings.acceptsVideo === false) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'At least one content type (acceptsPhoto or acceptsVideo) must be accepted.'
      });
    }

    // Validate point values are within range (should be caught by express-validator, but double-check)
    if (business.contentSettings.pointsPerPhoto < 1 || 
        business.contentSettings.pointsPerPhoto > 100) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'pointsPerPhoto must be between 1 and 100.'
      });
    }

    if (business.contentSettings.pointsPerVideo < 1 || 
        business.contentSettings.pointsPerVideo > 200) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'pointsPerVideo must be between 1 and 200.'
      });
    }

    // Save updated business
    await business.save();

    return res.status(200).json({
      message: 'Content settings updated successfully',
      business
    });
  } catch (error) {
    console.error('Error in updateContentSettings:', error);

    // Handle validation errors from Mongoose
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));

      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid content settings data',
        details: validationErrors
      });
    }

    // Generic error handler
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update content settings.',
      details: error.message
    });
  }
};

/**
 * GET /api/business/me
 * Get current user's business
 * Requires: local_business role (enforced by middleware)
 */
const getMyBusiness = async (req, res) => {
  try {
    // Ensure user is authenticated
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated. Please authenticate first.'
      });
    }

    // Find business owned by user and populate category
    const business = await Business.findOne({ userId: req.user._id })
      .populate('category', 'name description icon');

    if (!business) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Business not found. Please register a business first.'
      });
    }

    return res.status(200).json({
      message: 'Business retrieved successfully',
      business
    });
  } catch (error) {
    console.error('Error in getMyBusiness:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve business.',
      details: error.message
    });
  }
};

/**
 * POST /api/business/milestones
 * Create a new milestone for business
 * Requires: local_business role (enforced by middleware)
 */
const createMilestone = async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid input data',
        details: errors.array()
      });
    }

    // Ensure user is authenticated
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated. Please authenticate first.'
      });
    }

    // Find business owned by user
    const business = await Business.findOne({ userId: req.user._id });
    
    if (!business) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Business not found. Please register a business first.'
      });
    }

    // Check if business is verified
    if (!business.isVerified) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Business must be verified before creating milestones. Please wait for verification.'
      });
    }

    // Extract milestone data from request body
    const {
      points,
      rewardTitle,
      rewardDescription,
      termsAndConditions
    } = req.body;

    // Create new milestone object
    const newMilestone = {
      points: parseInt(points),
      rewardTitle: rewardTitle.trim(),
      rewardDescription: rewardDescription.trim()
    };

    if (termsAndConditions) {
      newMilestone.termsAndConditions = termsAndConditions.trim();
    }

    // Add milestone to business milestones array
    business.milestones.push(newMilestone);

    // Sort milestones by points ascending
    business.milestones.sort((a, b) => a.points - b.points);

    // Save updated business
    await business.save();

    return res.status(201).json({
      message: 'Milestone created successfully',
      milestones: business.milestones
    });
  } catch (error) {
    console.error('Error in createMilestone:', error);

    // Handle validation errors from Mongoose
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));

      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid milestone data',
        details: validationErrors
      });
    }

    // Generic error handler
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create milestone.',
      details: error.message
    });
  }
};

/**
 * PATCH /api/business/milestones/:milestoneId
 * Update a milestone by index
 * Requires: local_business role (enforced by middleware)
 */
const updateMilestone = async (req, res) => {
  try {
    // Ensure user is authenticated
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated. Please authenticate first.'
      });
    }

    // Get milestone index from params
    const milestoneId = parseInt(req.params.milestoneId);
    
    if (isNaN(milestoneId) || milestoneId < 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid milestone ID. Must be a valid array index.'
      });
    }

    // Find business owned by user
    const business = await Business.findOne({ userId: req.user._id });
    
    if (!business) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Business not found. Please register a business first.'
      });
    }

    // Validate milestone exists at that index
    if (milestoneId >= business.milestones.length) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Milestone at index ${milestoneId} not found.`
      });
    }

    // Extract updated fields from request body
    const {
      points,
      rewardTitle,
      rewardDescription,
      termsAndConditions
    } = req.body;

    // Update milestone fields if provided
    const milestone = business.milestones[milestoneId];

    if (points !== undefined) {
      const pointsValue = parseInt(points);
      if (isNaN(pointsValue) || pointsValue < 1) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Points must be an integer greater than 0.'
        });
      }
      milestone.points = pointsValue;
    }

    if (rewardTitle !== undefined) {
      if (typeof rewardTitle !== 'string' || rewardTitle.trim().length === 0) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Reward title must be a non-empty string.'
        });
      }
      if (rewardTitle.trim().length > 200) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Reward title must not exceed 200 characters.'
        });
      }
      milestone.rewardTitle = rewardTitle.trim();
    }

    if (rewardDescription !== undefined) {
      if (typeof rewardDescription !== 'string' || rewardDescription.trim().length === 0) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Reward description must be a non-empty string.'
        });
      }
      if (rewardDescription.trim().length > 1000) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Reward description must not exceed 1000 characters.'
        });
      }
      milestone.rewardDescription = rewardDescription.trim();
    }

    if (termsAndConditions !== undefined) {
      if (typeof termsAndConditions !== 'string') {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Terms and conditions must be a string.'
        });
      }
      if (termsAndConditions.trim().length > 2000) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Terms and conditions must not exceed 2000 characters.'
        });
      }
      milestone.termsAndConditions = termsAndConditions.trim();
    }

    // Sort milestones by points ascending after update
    business.milestones.sort((a, b) => a.points - b.points);

    // Save updated business
    await business.save();

    // Find the updated milestone (it may have moved after sorting)
    const updatedMilestone = business.milestones.find(
      m => m._id && m._id.toString() === milestone._id.toString()
    ) || business.milestones[milestoneId];

    return res.status(200).json({
      message: 'Milestone updated successfully',
      milestone: updatedMilestone
    });
  } catch (error) {
    console.error('Error in updateMilestone:', error);

    // Handle validation errors from Mongoose
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));

      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid milestone data',
        details: validationErrors
      });
    }

    // Generic error handler
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update milestone.',
      details: error.message
    });
  }
};

/**
 * DELETE /api/business/milestones/:milestoneId
 * Delete a milestone by index
 * Requires: local_business role (enforced by middleware)
 */
const deleteMilestone = async (req, res) => {
  try {
    // Ensure user is authenticated
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated. Please authenticate first.'
      });
    }

    // Get milestone index from params
    const milestoneId = parseInt(req.params.milestoneId);
    
    if (isNaN(milestoneId) || milestoneId < 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid milestone ID. Must be a valid array index.'
      });
    }

    // Find business owned by user
    const business = await Business.findOne({ userId: req.user._id });
    
    if (!business) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Business not found. Please register a business first.'
      });
    }

    // Validate milestone exists at that index
    if (milestoneId >= business.milestones.length) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Milestone at index ${milestoneId} not found.`
      });
    }

    // Remove milestone at that index using splice
    business.milestones.splice(milestoneId, 1);

    // Save updated business
    await business.save();

    return res.status(200).json({
      message: 'Milestone deleted successfully'
    });
  } catch (error) {
    console.error('Error in deleteMilestone:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete milestone.',
      details: error.message
    });
  }
};

/**
 * GET /api/business/:businessId/milestones
 * Get milestones for a business
 * Public route (no auth required)
 */
const getMilestones = async (req, res) => {
  try {
    // Get businessId from params
    const { businessId } = req.params;

    // Validate businessId is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(businessId)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid business ID format.'
      });
    }

    // Find business by id
    const business = await Business.findById(businessId);

    if (!business) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Business not found.'
      });
    }

    // Return milestones array
    return res.status(200).json({
      message: 'Milestones retrieved successfully',
      milestones: business.milestones || []
    });
  } catch (error) {
    console.error('Error in getMilestones:', error);

    // Handle cast errors (invalid ObjectId, etc.)
    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid business ID format.',
        details: error.message
      });
    }

    // Generic error handler
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve milestones.',
      details: error.message
    });
  }
};

/**
 * GET /api/business/stats
 * Get comprehensive business statistics
 * Only accessible by local business owners
 */
const getBusinessStats = async (req, res) => {
  try {
    // Validate user is authenticated
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated. Please authenticate first.'
      });
    }

    // Find business owned by user
    const business = await Business.findOne({ userId: req.user._id });

    if (!business) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Business not found. Please register a business first.'
      });
    }

    const businessId = business._id;

    // 1. Content Overview - Use aggregation for efficient counting
    const contentOverview = await Content.aggregate([
      { $match: { businessId: businessId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Convert to object for easier access
    const statusCounts = {
      pending: 0,
      accepted: 0,
      rejected: 0
    };

    contentOverview.forEach(item => {
      if (statusCounts.hasOwnProperty(item._id)) {
        statusCounts[item._id] = item.count;
      }
    });

    const acceptedCount = statusCounts.accepted;
    const rejectedCount = statusCounts.rejected;
    const totalReviewed = acceptedCount + rejectedCount;
    const acceptanceRate = totalReviewed > 0 
      ? Math.round((acceptedCount / totalReviewed) * 100 * 100) / 100 
      : 0;

    // 2. Content Breakdown - Count by type
    const contentBreakdown = await Content.aggregate([
      { $match: { businessId: businessId } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      }
    ]);

    const photoCount = contentBreakdown.find(item => item._id === 'photo')?.count || 0;
    const videoCount = contentBreakdown.find(item => item._id === 'video')?.count || 0;

    // 3. Creator Statistics
    // Total unique creators
    const uniqueCreatorsResult = await Content.aggregate([
      { $match: { businessId: businessId } },
      { $group: { _id: '$creatorId' } },
      { $count: 'totalUniqueCreators' }
    ]);

    const totalUniqueCreators = uniqueCreatorsResult[0]?.totalUniqueCreators || 0;

    // Top contributors - aggregate by creatorId
    const topContributorsAgg = await Content.aggregate([
      { $match: { businessId: businessId } },
      {
        $group: {
          _id: '$creatorId',
          submissionCount: { $sum: 1 },
          acceptedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] }
          }
        }
      },
      { $sort: { submissionCount: -1 } },
      { $limit: 10 }
    ]);

    // Populate creator details for top contributors
    const topContributors = await Promise.all(
      topContributorsAgg.map(async (contributor) => {
        const creator = await User.findById(contributor._id)
          .select('profile.name profile.avatar')
          .lean();
        
        return {
          creatorId: contributor._id,
          name: creator?.profile?.name || 'Unknown',
          avatar: creator?.profile?.avatar || null,
          submissionCount: contributor.submissionCount,
          acceptedCount: contributor.acceptedCount
        };
      })
    );

    // 4. Timeline Data - Last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const timelineData = await Content.aggregate([
      {
        $match: {
          businessId: businessId,
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Format timeline data
    const contentOverTime = timelineData.map(item => ({
      date: item._id,
      count: item.count
    }));

    // 5. Milestone Stats
    const milestoneStats = [];
    
    if (business.milestones && business.milestones.length > 0) {
      // Get all creator progress for this business
      const allProgress = await CreatorProgress.find({ businessId: businessId })
        .select('milestonesAchieved')
        .lean();

      // Process each milestone
      for (let i = 0; i < business.milestones.length; i++) {
        const milestone = business.milestones[i];
        let achievedCount = 0;
        let redeemedCount = 0;

        // Count achievements and redemptions
        allProgress.forEach(progress => {
          const milestoneAchievement = progress.milestonesAchieved.find(
            m => m.milestoneIndex === i
          );
          
          if (milestoneAchievement) {
            achievedCount++;
            if (milestoneAchievement.redeemed) {
              redeemedCount++;
            }
          }
        });

        milestoneStats.push({
          milestoneIndex: i,
          points: milestone.points,
          rewardTitle: milestone.rewardTitle,
          achievedCount,
          redeemedCount
        });
      }
    }

    // Compile all statistics
    const statistics = {
      contentOverview: {
        totalContentReceived: business.totalContentReceived,
        pendingCount: statusCounts.pending,
        acceptedCount: acceptedCount,
        rejectedCount: rejectedCount,
        acceptanceRate: acceptanceRate
      },
      contentBreakdown: {
        photoCount: photoCount,
        videoCount: videoCount
      },
      creatorStatistics: {
        totalUniqueCreators: totalUniqueCreators,
        topContributors: topContributors
      },
      timelineData: {
        contentOverTime: contentOverTime
      },
      milestoneStats: milestoneStats
    };

    return res.status(200).json({
      message: 'Business statistics retrieved successfully',
      statistics
    });
  } catch (error) {
    console.error('Error in getBusinessStats:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve business statistics.',
      details: error.message
    });
  }
};

module.exports = {
  registerBusiness,
  validateBusinessRegistration,
  updateContentSettings,
  validateContentSettings,
  getMyBusiness,
  createMilestone,
  validateMilestone,
  updateMilestone,
  deleteMilestone,
  getMilestones,
  getBusinessStats
};
