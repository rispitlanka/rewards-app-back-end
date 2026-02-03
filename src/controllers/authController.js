const User = require('../models/User');
const Business = require('../models/Business');

/**
 * POST /api/auth/sync
 * Syncs user from Clerk to our database
 * Body: { clerkId, email, role, name }
 */
const syncUser = async (req, res) => {
  try {
    const { clerkId, email, role, name } = req.body;

    // Validate required fields
    if (!clerkId || !email || !name) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'clerkId, email, and name are required fields.'
      });
    }

    // Validate role if provided
    if (role && !['content_creator', 'local_business', 'super_admin'].includes(role)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid role. Must be one of: content_creator, local_business, super_admin.'
      });
    }

    // Check if user exists
    let user = await User.findOne({ clerkId });

    if (user) {
      // Update existing user
      user.email = email;
      if (role) {
        user.role = role;
      }
      user.profile.name = name;
      await user.save();

      return res.status(200).json({
        message: 'User updated successfully',
        user
      });
    } else {
      // Create new user
      user = new User({
        clerkId,
        email,
        role: role || 'content_creator',
        profile: {
          name
        }
      });

      await user.save();

      return res.status(200).json({
        message: 'User created successfully',
        user
      });
    }
  } catch (error) {
    console.error('Error in syncUser:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'User with this clerkId or email already exists.',
        details: error.message
      });
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to sync user.',
      details: error.message
    });
  }
};

/**
 * GET /api/auth/me
 * Returns current authenticated user
 * Requires verifyClerkToken middleware
 */
const getCurrentUser = async (req, res) => {
  try {
    // req.user should be populated by verifyClerkToken middleware
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated. Please authenticate first.'
      });
    }

    let userData = req.user.toObject();

    // If user is a local_business, populate business details
    if (req.user.role === 'local_business') {
      const business = await Business.findOne({ userId: req.user._id })
        .populate('category', 'name')
        .lean();

      if (business) {
        userData.business = business;
      }
    }

    return res.status(200).json({
      message: 'User retrieved successfully',
      user: userData
    });
  } catch (error) {
    console.error('Error in getCurrentUser:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve user.',
      details: error.message
    });
  }
};

/**
 * PATCH /api/auth/profile
 * Updates user profile (name, avatar)
 * Requires verifyClerkToken middleware
 */
const updateProfile = async (req, res) => {
  try {
    // req.user should be populated by verifyClerkToken middleware
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated. Please authenticate first.'
      });
    }

    const { name, avatar } = req.body;

    // Validate that at least one field is provided
    if (!name && !avatar) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'At least one field (name or avatar) must be provided for update.'
      });
    }

    // Validate name if provided
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Name must be a non-empty string.'
        });
      }
      req.user.profile.name = name.trim();
    }

    // Validate avatar if provided
    if (avatar !== undefined) {
      if (typeof avatar !== 'string') {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Avatar must be a string (URL).'
        });
      }
      req.user.profile.avatar = avatar;
    }

    // Save updated user
    await req.user.save();

    return res.status(200).json({
      message: 'Profile updated successfully',
      user: req.user
    });
  } catch (error) {
    console.error('Error in updateProfile:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update profile.',
      details: error.message
    });
  }
};

module.exports = {
  syncUser,
  getCurrentUser,
  updateProfile
};
