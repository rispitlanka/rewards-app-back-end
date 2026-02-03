const mongoose = require('mongoose');
const Content = require('../models/Content');
const Business = require('../models/Business');
const CreatorProgress = require('../models/CreatorProgress');
const { uploadImage, uploadVideo, deleteFile } = require('../utils/fileUpload');

/**
 * POST /api/content/submit
 * Submit content (photo or video) to a business
 * Only accessible by content creators
 * Requires multipart form data: businessId, type, caption (optional), file
 */
const submitContent = async (req, res) => {
  let uploadedFilePublicId = null;
  let contentSaved = false;

  try {
    // Validate user is authenticated (should be set by verifyClerkToken middleware)
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated. Please authenticate first.'
      });
    }

    // Get form data from request body
    const { businessId, type, caption } = req.body;

    // Validate required fields
    if (!businessId) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'businessId is required'
      });
    }

    if (!type) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'type is required. Must be "photo" or "video"'
      });
    }

    if (type !== 'photo' && type !== 'video') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'type must be either "photo" or "video"'
      });
    }

    // Validate file exists
    if (!req.file) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'File is required'
      });
    }

    // Validate file type matches content type
    const isImage = req.file.mimetype.startsWith('image/');
    const isVideo = req.file.mimetype.startsWith('video/');

    if (type === 'photo' && !isImage) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'File type mismatch. Expected image file for photo content type.'
      });
    }

    if (type === 'video' && !isVideo) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'File type mismatch. Expected video file for video content type.'
      });
    }

    // Validate businessId format
    if (!mongoose.Types.ObjectId.isValid(businessId)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid businessId format'
      });
    }

    // Validate caption length if provided
    if (caption && caption.length > 200) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Caption must not exceed 200 characters'
      });
    }

    // Find business by businessId
    const business = await Business.findById(businessId);

    if (!business) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Business not found'
      });
    }

    // Check if business is verified and active
    if (!business.isVerified) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Business is not verified'
      });
    }

    if (business.status !== 'active') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Business is not active'
      });
    }

    // Check if business accepts this content type
    if (type === 'photo' && !business.contentSettings.acceptsPhoto) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Business does not accept photo content'
      });
    }

    if (type === 'video' && !business.contentSettings.acceptsVideo) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Business does not accept video content'
      });
    }

    // Upload file to Cloudinary
    let uploadResult;
    const folder = type === 'photo' ? 'content/photos' : 'content/videos';

    try {
      if (type === 'photo') {
        uploadResult = await uploadImage(req.file.buffer, folder);
      } else {
        uploadResult = await uploadVideo(req.file.buffer, folder);
      }

      uploadedFilePublicId = uploadResult.public_id;
    } catch (uploadError) {
      console.error('Cloudinary upload error:', uploadError);
      return res.status(500).json({
        error: 'Upload Failed',
        message: 'Failed to upload file to Cloudinary.',
        details: uploadError.message
      });
    }

    // Create Content document
    const contentData = {
      creatorId: req.user._id,
      businessId: business._id,
      type: type,
      fileUrl: uploadResult.url,
      caption: caption ? caption.trim() : undefined,
      status: 'pending'
    };

    // Add thumbnailUrl for videos
    if (type === 'video' && uploadResult.thumbnailUrl) {
      contentData.thumbnailUrl = uploadResult.thumbnailUrl;
    }

    const content = new Content(contentData);

    // Increment business.totalContentReceived
    business.totalContentReceived += 1;

    // Create or update CreatorProgress document
    let creatorProgress = await CreatorProgress.findOne({
      creatorId: req.user._id,
      businessId: business._id
    });

    if (creatorProgress) {
      // Update existing progress
      creatorProgress.contentSubmitted += 1;
    } else {
      // Create new progress
      creatorProgress = new CreatorProgress({
        creatorId: req.user._id,
        businessId: business._id,
        contentSubmitted: 1,
        totalPoints: 0,
        contentAccepted: 0,
        contentRejected: 0
      });
    }

    // Save all documents
    // Save content first - if this fails, we'll cleanup the uploaded file
    await content.save();
    
    // Mark that content was saved successfully (so we don't cleanup on subsequent errors)
    contentSaved = true;

    // Save business and creator progress
    await Promise.all([
      business.save(),
      creatorProgress.save()
    ]);

    // Populate content details for response
    await content.populate('businessId', 'businessName logo category');

    return res.status(201).json({
      message: 'Content submitted successfully',
      content: content.toObject()
    });
  } catch (error) {
    console.error('Error in submitContent:', error);

    // Cleanup: Delete uploaded file from Cloudinary if upload was successful
    // but content creation failed (only cleanup if content wasn't saved)
    if (uploadedFilePublicId && !contentSaved) {
      try {
        await deleteFile(uploadedFilePublicId);
        console.log(`Cleaned up uploaded file: ${uploadedFilePublicId}`);
      } catch (cleanupError) {
        console.error('Error cleaning up uploaded file:', cleanupError);
      }
    }

    // Handle duplicate key errors (shouldn't happen for Content, but handle gracefully)
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Content already exists.',
        details: error.message
      });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid content data.',
        details: error.message
      });
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to submit content.',
      details: error.message
    });
  }
};

/**
 * GET /api/content/my-content
 * Get all content submitted by the current creator
 * Query params: status (optional filter), page, limit
 */
const getMyContent = async (req, res) => {
  try {
    // Validate user is authenticated
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated. Please authenticate first.'
      });
    }

    // Get query params
    const { status, page = 1, limit = 10 } = req.query;

    // Build query object
    const query = {
      creatorId: req.user._id
    };

    // Add status filter if provided
    if (status) {
      if (!['pending', 'accepted', 'rejected'].includes(status)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid status. Must be one of: pending, accepted, rejected'
        });
      }
      query.status = status;
    }

    // Convert page and limit to numbers
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Find content with pagination
    const [content, total] = await Promise.all([
      Content.find(query)
        .populate('businessId', 'businessName logo category')
        .sort({ createdAt: -1 }) // Newest first
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Content.countDocuments(query)
    ]);

    // Calculate total pages
    const totalPages = Math.ceil(total / limitNum);

    return res.status(200).json({
      content,
      total,
      currentPage: pageNum,
      totalPages
    });
  } catch (error) {
    console.error('Error in getMyContent:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve content.',
      details: error.message
    });
  }
};

/**
 * GET /api/content/my-content/:businessId
 * Get all content submitted by the current creator for a specific business
 * Query params: status, page, limit
 */
const getMyContentForBusiness = async (req, res) => {
  try {
    // Validate user is authenticated
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated. Please authenticate first.'
      });
    }

    // Get businessId from params
    const { businessId } = req.params;

    // Validate businessId format
    if (!mongoose.Types.ObjectId.isValid(businessId)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid businessId format'
      });
    }

    // Get query params
    const { status, page = 1, limit = 10 } = req.query;

    // Build base query object (for statistics - always without status filter)
    const baseQuery = {
      creatorId: req.user._id,
      businessId: businessId
    };

    // Build filtered query object (for content list - with status filter if provided)
    const query = { ...baseQuery };

    // Add status filter if provided
    if (status) {
      if (!['pending', 'accepted', 'rejected'].includes(status)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid status. Must be one of: pending, accepted, rejected'
        });
      }
      query.status = status;
    }

    // Convert page and limit to numbers
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Find content with pagination and get statistics
    // Statistics should always use baseQuery (without status filter)
    const [content, total, accepted, rejected, pending] = await Promise.all([
      Content.find(query)
        .sort({ createdAt: -1 }) // Newest first
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Content.countDocuments(query), // Total for filtered query (for pagination)
      Content.countDocuments({ ...baseQuery, status: 'accepted' }),
      Content.countDocuments({ ...baseQuery, status: 'rejected' }),
      Content.countDocuments({ ...baseQuery, status: 'pending' })
    ]);

    // Calculate total for statistics (all content for this creator-business pair)
    const totalForStats = accepted + rejected + pending;

    // Calculate total pages
    const totalPages = Math.ceil(total / limitNum);

    return res.status(200).json({
      content,
      statistics: {
        total: totalForStats,
        accepted,
        rejected,
        pending
      },
      currentPage: pageNum,
      totalPages
    });
  } catch (error) {
    console.error('Error in getMyContentForBusiness:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve content.',
      details: error.message
    });
  }
};

/**
 * GET /api/content/progress/:businessId
 * Get creator progress for a specific business
 * Returns progress data, milestones, and next milestone info
 */
const getCreatorProgress = async (req, res) => {
  try {
    // Validate user is authenticated
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated. Please authenticate first.'
      });
    }

    // Get businessId from params
    const { businessId } = req.params;

    // Validate businessId format
    if (!mongoose.Types.ObjectId.isValid(businessId)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid businessId format'
      });
    }

    // Find CreatorProgress for this creator-business pair
    const creatorProgress = await CreatorProgress.findOne({
      creatorId: req.user._id,
      businessId: businessId
    });

    // If no progress found, return 404
    if (!creatorProgress) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'No progress found. Creator has not submitted content to this business yet.'
      });
    }

    // Find business to get milestones
    const business = await Business.findById(businessId)
      .select('businessName logo category milestones')
      .populate('category', 'name description')
      .lean();

    if (!business) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Business not found'
      });
    }

    // Calculate acceptance rate
    const acceptanceRate = creatorProgress.calculateAcceptanceRate();

    // Find next milestone
    let nextMilestone = null;
    if (business.milestones && business.milestones.length > 0) {
      // Get achieved milestone indices
      const achievedIndices = creatorProgress.milestonesAchieved.map(m => m.milestoneIndex);
      
      // Find the first milestone that hasn't been achieved
      for (let i = 0; i < business.milestones.length; i++) {
        if (!achievedIndices.includes(i)) {
          const milestone = business.milestones[i];
          const pointsNeeded = milestone.points - creatorProgress.totalPoints;
          
          nextMilestone = {
            milestoneIndex: i,
            points: milestone.points,
            pointsNeeded: pointsNeeded > 0 ? pointsNeeded : 0,
            rewardTitle: milestone.rewardTitle,
            rewardDescription: milestone.rewardDescription,
            termsAndConditions: milestone.termsAndConditions
          };
          break;
        }
      }
    }

    // Prepare response
    const progressData = {
      progress: {
        totalPoints: creatorProgress.totalPoints,
        contentSubmitted: creatorProgress.contentSubmitted,
        contentAccepted: creatorProgress.contentAccepted,
        contentRejected: creatorProgress.contentRejected,
        acceptanceRate: Math.round(acceptanceRate * 100) / 100, // Round to 2 decimal places
        milestonesAchieved: creatorProgress.milestonesAchieved.map(m => ({
          milestoneIndex: m.milestoneIndex,
          achievedAt: m.achievedAt,
          redeemed: m.redeemed,
          redeemedAt: m.redeemedAt
        })),
        updatedAt: creatorProgress.updatedAt
      },
      business: {
        businessName: business.businessName,
        logo: business.logo,
        category: business.category
      },
      milestones: business.milestones || [],
      nextMilestone: nextMilestone
    };

    return res.status(200).json(progressData);
  } catch (error) {
    console.error('Error in getCreatorProgress:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve creator progress.',
      details: error.message
    });
  }
};

/**
 * GET /api/content/pending
 * Get pending content for business owner
 * Only accessible by local business owners
 * Query params: creatorId (optional filter), page, limit
 */
const getPendingContent = async (req, res) => {
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

    // Get query params
    const { creatorId, page = 1, limit = 10 } = req.query;

    // Build query object
    const query = {
      businessId: business._id,
      status: 'pending'
    };

    // Add creatorId filter if provided
    if (creatorId) {
      if (!mongoose.Types.ObjectId.isValid(creatorId)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid creatorId format'
        });
      }
      query.creatorId = creatorId;
    }

    // Convert page and limit to numbers
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Find content with pagination
    const [content, total] = await Promise.all([
      Content.find(query)
        .populate('creatorId', 'profile.name profile.avatar')
        .sort({ createdAt: 1 }) // Oldest first (FIFO)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Content.countDocuments(query)
    ]);

    // Calculate total pages
    const totalPages = Math.ceil(total / limitNum);

    return res.status(200).json({
      content,
      total,
      currentPage: pageNum,
      totalPages
    });
  } catch (error) {
    console.error('Error in getPendingContent:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve pending content.',
      details: error.message
    });
  }
};

/**
 * GET /api/content/all
 * Get all content for business owner with filters
 * Only accessible by local business owners
 * Query params: status, creatorId, type, page, limit
 */
const getAllBusinessContent = async (req, res) => {
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

    // Get query params
    const { status, creatorId, type, page = 1, limit = 10 } = req.query;

    // Build base query object
    const baseQuery = {
      businessId: business._id
    };

    // Build filtered query object
    const query = { ...baseQuery };

    // Add optional filters
    if (status) {
      if (!['pending', 'accepted', 'rejected'].includes(status)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid status. Must be one of: pending, accepted, rejected'
        });
      }
      query.status = status;
    }

    if (creatorId) {
      if (!mongoose.Types.ObjectId.isValid(creatorId)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid creatorId format'
        });
      }
      query.creatorId = creatorId;
    }

    if (type) {
      if (!['photo', 'video'].includes(type)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid type. Must be one of: photo, video'
        });
      }
      query.type = type;
    }

    // Convert page and limit to numbers
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Find content with pagination and get statistics
    const [content, total, pending, accepted, rejected] = await Promise.all([
      Content.find(query)
        .populate('creatorId', 'profile.name profile.avatar email')
        .sort({ createdAt: -1 }) // Newest first
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Content.countDocuments(query),
      Content.countDocuments({ ...baseQuery, status: 'pending' }),
      Content.countDocuments({ ...baseQuery, status: 'accepted' }),
      Content.countDocuments({ ...baseQuery, status: 'rejected' })
    ]);

    // Calculate total pages
    const totalPages = Math.ceil(total / limitNum);

    return res.status(200).json({
      content,
      statistics: {
        total: pending + accepted + rejected,
        pending,
        accepted,
        rejected
      },
      currentPage: pageNum,
      totalPages
    });
  } catch (error) {
    console.error('Error in getAllBusinessContent:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve content.',
      details: error.message
    });
  }
};

/**
 * GET /api/content/creator/:creatorId
 * Get all content from a specific creator for business owner
 * Only accessible by local business owners
 */
const getContentByCreator = async (req, res) => {
  try {
    // Validate user is authenticated
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated. Please authenticate first.'
      });
    }

    // Get creatorId from params
    const { creatorId } = req.params;

    // Validate creatorId format
    if (!mongoose.Types.ObjectId.isValid(creatorId)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid creatorId format'
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

    // Find all content for this business and creator
    const content = await Content.find({
      businessId: business._id,
      creatorId: creatorId
    })
      .populate('creatorId', 'profile.name profile.avatar email')
      .sort({ createdAt: -1 }) // Newest first
      .lean();

    // Calculate statistics
    const statistics = {
      total: content.length,
      pending: content.filter(c => c.status === 'pending').length,
      accepted: content.filter(c => c.status === 'accepted').length,
      rejected: content.filter(c => c.status === 'rejected').length,
      photo: content.filter(c => c.type === 'photo').length,
      video: content.filter(c => c.type === 'video').length
    };

    return res.status(200).json({
      content,
      statistics
    });
  } catch (error) {
    console.error('Error in getContentByCreator:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve content.',
      details: error.message
    });
  }
};

/**
 * PATCH /api/content/:contentId/accept
 * Accept pending content
 * Only accessible by local business owners
 */
const acceptContent = async (req, res) => {
  try {
    // Validate user is authenticated
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated. Please authenticate first.'
      });
    }

    // Get contentId from params
    const { contentId } = req.params;

    // Validate contentId format
    if (!mongoose.Types.ObjectId.isValid(contentId)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid contentId format'
      });
    }

    // Get isPrivate from request body
    const { isPrivate } = req.body;

    // Validate isPrivate is boolean if provided
    if (isPrivate !== undefined && typeof isPrivate !== 'boolean') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'isPrivate must be a boolean value'
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

    // Find content by id
    const content = await Content.findById(contentId);

    if (!content) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Content not found'
      });
    }

    // Validate content belongs to this business
    if (content.businessId.toString() !== business._id.toString()) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Content does not belong to your business'
      });
    }

    // Validate content status is 'pending'
    if (content.status !== 'pending') {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Content cannot be accepted. Current status: ${content.status}`
      });
    }

    // Calculate points based on content type
    let pointsToAward = 0;
    if (content.type === 'photo') {
      pointsToAward = business.contentSettings.pointsPerPhoto;
    } else if (content.type === 'video') {
      pointsToAward = business.contentSettings.pointsPerVideo;
    }

    // Update content
    content.status = 'accepted';
    content.isPrivate = isPrivate !== undefined ? isPrivate : content.isPrivate;
    content.reviewedBy = req.user._id;
    content.reviewedAt = new Date();
    content.points = pointsToAward;

    // Save content
    await content.save();

    // Find or create CreatorProgress document
    let creatorProgress = await CreatorProgress.findOne({
      creatorId: content.creatorId,
      businessId: business._id
    });

    if (!creatorProgress) {
      // Create new progress if it doesn't exist
      creatorProgress = new CreatorProgress({
        creatorId: content.creatorId,
        businessId: business._id,
        contentSubmitted: 0, // This should have been set when content was submitted
        contentAccepted: 0,
        contentRejected: 0,
        totalPoints: 0,
        milestonesAchieved: []
      });
    }

    // Update CreatorProgress
    creatorProgress.contentAccepted += 1;
    creatorProgress.totalPoints += pointsToAward;

    // Check if any milestone threshold is reached
    let milestoneAchieved = false;
    let milestoneDetails = null;
    const newlyAchievedMilestones = [];

    if (business.milestones && business.milestones.length > 0) {
      // Get already achieved milestone indices
      const achievedIndices = creatorProgress.milestonesAchieved.map(m => m.milestoneIndex);

      // Loop through business milestones
      for (let i = 0; i < business.milestones.length; i++) {
        const milestone = business.milestones[i];
        
        // Check if totalPoints >= milestone.points and not already achieved
        if (creatorProgress.totalPoints >= milestone.points && !achievedIndices.includes(i)) {
          // Add milestone to achievements
          creatorProgress.milestonesAchieved.push({
            milestoneIndex: i,
            achievedAt: new Date(),
            redeemed: false
          });

          newlyAchievedMilestones.push({
            milestoneIndex: i,
            points: milestone.points,
            rewardTitle: milestone.rewardTitle,
            rewardDescription: milestone.rewardDescription,
            termsAndConditions: milestone.termsAndConditions,
            achievedAt: new Date()
          });

          milestoneAchieved = true;
        }
      }

      // If multiple milestones achieved, return the highest one (or first one)
      // Typically only one milestone is reached at a time, but handle multiple if needed
      if (newlyAchievedMilestones.length > 0) {
        // Sort by milestoneIndex to get the highest milestone reached
        newlyAchievedMilestones.sort((a, b) => b.milestoneIndex - a.milestoneIndex);
        milestoneDetails = newlyAchievedMilestones[0];
      }
    }

    // Save CreatorProgress
    await creatorProgress.save();

    // Populate content details for response
    await content.populate('creatorId', 'profile.name profile.avatar email');

    // Prepare response
    const response = {
      message: 'Content accepted successfully',
      content: content.toObject(),
      newPointsEarned: pointsToAward,
      milestoneAchieved: milestoneAchieved
    };

    if (milestoneAchieved && milestoneDetails) {
      response.milestoneDetails = milestoneDetails;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error in acceptContent:', error);

    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid content data.',
        details: error.message
      });
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to accept content.',
      details: error.message
    });
  }
};

/**
 * PATCH /api/content/:contentId/reject
 * Reject pending content
 * Only accessible by local business owners
 */
const rejectContent = async (req, res) => {
  try {
    // Validate user is authenticated
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated. Please authenticate first.'
      });
    }

    // Get contentId from params
    const { contentId } = req.params;

    // Validate contentId format
    if (!mongoose.Types.ObjectId.isValid(contentId)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid contentId format'
      });
    }

    // Get rejectionReason from request body (optional)
    const { rejectionReason } = req.body;

    // Validate rejectionReason is string if provided
    if (rejectionReason !== undefined && typeof rejectionReason !== 'string') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'rejectionReason must be a string'
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

    // Find content by id
    const content = await Content.findById(contentId);

    if (!content) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Content not found'
      });
    }

    // Validate content belongs to this business
    if (content.businessId.toString() !== business._id.toString()) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Content does not belong to your business'
      });
    }

    // Validate content status is 'pending'
    if (content.status !== 'pending') {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Content cannot be rejected. Current status: ${content.status}`
      });
    }

    // Update content
    content.status = 'rejected';
    if (rejectionReason !== undefined) {
      content.rejectionReason = rejectionReason;
    }
    content.reviewedBy = req.user._id;
    content.reviewedAt = new Date();
    content.points = 0; // No points for rejected content

    // Save content
    await content.save();

    // Find or create CreatorProgress document
    let creatorProgress = await CreatorProgress.findOne({
      creatorId: content.creatorId,
      businessId: business._id
    });

    if (!creatorProgress) {
      // Create new progress if it doesn't exist
      creatorProgress = new CreatorProgress({
        creatorId: content.creatorId,
        businessId: business._id,
        contentSubmitted: 0, // This should have been set when content was submitted
        contentAccepted: 0,
        contentRejected: 0,
        totalPoints: 0,
        milestonesAchieved: []
      });
    }

    // Update CreatorProgress - increment contentRejected
    creatorProgress.contentRejected += 1;

    // Save CreatorProgress
    await creatorProgress.save();

    // Populate content details for response
    await content.populate('creatorId', 'profile.name profile.avatar email');

    return res.status(200).json({
      message: 'Content rejected successfully',
      content: content.toObject()
    });
  } catch (error) {
    console.error('Error in rejectContent:', error);

    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid content data.',
        details: error.message
      });
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to reject content.',
      details: error.message
    });
  }
};

module.exports = {
  submitContent,
  getMyContent,
  getMyContentForBusiness,
  getCreatorProgress,
  getPendingContent,
  getAllBusinessContent,
  getContentByCreator,
  acceptContent,
  rejectContent
};
