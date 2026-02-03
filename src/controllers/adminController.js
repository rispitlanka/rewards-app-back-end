const mongoose = require('mongoose');
const { Parser } = require('json2csv');
const User = require('../models/User');
const Business = require('../models/Business');
const Content = require('../models/Content');
const CreatorProgress = require('../models/CreatorProgress');
const Category = require('../models/Category');

/**
 * GET /api/admin/dashboard/stats
 * Get comprehensive dashboard statistics
 * Only accessible by super admin
 */
const getDashboardStats = async (req, res) => {
  try {
    // Validate user is authenticated
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated. Please authenticate first.'
      });
    }

    // Calculate date ranges
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(now);
    monthAgo.setDate(monthAgo.getDate() - 30);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // A. User Statistics
    const userStats = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);

    const userCounts = {
      content_creator: 0,
      local_business: 0,
      super_admin: 0
    };

    userStats.forEach(item => {
      if (userCounts.hasOwnProperty(item._id)) {
        userCounts[item._id] = item.count;
      }
    });

    const totalUsers = userCounts.content_creator + userCounts.local_business + userCounts.super_admin;

    const newUsersThisWeek = await User.countDocuments({
      createdAt: { $gte: weekAgo }
    });

    const newUsersThisMonth = await User.countDocuments({
      createdAt: { $gte: monthAgo }
    });

    // B. Business Statistics
    const businessStats = await Business.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          verified: {
            $sum: { $cond: [{ $eq: ['$isVerified', true] }, 1, 0] }
          },
          unverified: {
            $sum: { $cond: [{ $eq: ['$isVerified', false] }, 1, 0] }
          },
          active: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
          },
          suspended: {
            $sum: { $cond: [{ $eq: ['$status', 'suspended'] }, 1, 0] }
          }
        }
      }
    ]);

    const businessData = businessStats[0] || {
      total: 0,
      verified: 0,
      unverified: 0,
      active: 0,
      suspended: 0
    };

    // C. Content Statistics
    const contentStats = await Content.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          today: {
            $sum: {
              $cond: [{ $gte: ['$createdAt', todayStart] }, 1, 0]
            }
          },
          thisWeek: {
            $sum: {
              $cond: [{ $gte: ['$createdAt', weekAgo] }, 1, 0]
            }
          },
          thisMonth: {
            $sum: {
              $cond: [{ $gte: ['$createdAt', monthAgo] }, 1, 0]
            }
          },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          accepted: {
            $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] }
          },
          rejected: {
            $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] }
          }
        }
      }
    ]);

    const contentData = contentStats[0] || {
      total: 0,
      today: 0,
      thisWeek: 0,
      thisMonth: 0,
      pending: 0,
      accepted: 0,
      rejected: 0
    };

    const totalReviewed = contentData.accepted + contentData.rejected;
    const platformAcceptanceRate = totalReviewed > 0
      ? Math.round((contentData.accepted / totalReviewed) * 100 * 100) / 100
      : 0;

    // D. Growth Charts - User Growth (last 30 days)
    const userGrowth = await User.aggregate([
      {
        $match: {
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
          contentCreators: {
            $sum: { $cond: [{ $eq: ['$role', 'content_creator'] }, 1, 0] }
          },
          localBusinesses: {
            $sum: { $cond: [{ $eq: ['$role', 'local_business'] }, 1, 0] }
          },
          total: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const userGrowthFormatted = userGrowth.map(item => ({
      date: item._id,
      contentCreators: item.contentCreators,
      localBusinesses: item.localBusinesses,
      total: item.total
    }));

    // D. Growth Charts - Content Growth (last 30 days)
    const contentGrowth = await Content.aggregate([
      {
        $match: {
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
          accepted: {
            $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] }
          },
          rejected: {
            $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] }
          },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          total: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const contentGrowthFormatted = contentGrowth.map(item => ({
      date: item._id,
      accepted: item.accepted,
      rejected: item.rejected,
      pending: item.pending,
      total: item.total
    }));

    // E. Category Distribution
    // Businesses by category
    const businessesByCategoryAgg = await Business.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const businessesByCategory = await Promise.all(
      businessesByCategoryAgg.map(async (item) => {
        const category = await Category.findById(item._id)
          .select('name')
          .lean();
        return {
          categoryId: item._id,
          categoryName: category?.name || 'Unknown',
          count: item.count
        };
      })
    );

    // Content by category (through business)
    const contentByCategoryAgg = await Content.aggregate([
      {
        $lookup: {
          from: 'businesses',
          localField: 'businessId',
          foreignField: '_id',
          as: 'business'
        }
      },
      { $unwind: '$business' },
      {
        $group: {
          _id: '$business.category',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const contentByCategory = await Promise.all(
      contentByCategoryAgg.map(async (item) => {
        const category = await Category.findById(item._id)
          .select('name')
          .lean();
        return {
          categoryId: item._id,
          categoryName: category?.name || 'Unknown',
          count: item.count
        };
      })
    );

    // F. Geographic Distribution
    // Businesses by country
    const businessesByCountry = await Business.aggregate([
      {
        $group: {
          _id: '$location.country',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const businessesByCountryFormatted = businessesByCountry.map(item => ({
      country: item._id,
      count: item.count
    }));

    // Top 10 cities
    const businessesByCity = await Business.aggregate([
      {
        $group: {
          _id: {
            city: '$location.city',
            country: '$location.country'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    const businessesByCityFormatted = businessesByCity.map(item => ({
      city: item._id.city,
      country: item._id.country,
      count: item.count
    }));

    // G. Recent Activity (last 20 events)
    const recentActivity = [];

    // Recent user registrations (last 20)
    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('profile.name email role createdAt')
      .lean();

    recentUsers.forEach(user => {
      recentActivity.push({
        type: 'user_registration',
        description: `${user.profile.name} (${user.role}) registered`,
        timestamp: user.createdAt
      });
    });

    // Recent business registrations (last 10)
    const recentBusinesses = await Business.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('businessName createdAt')
      .lean();

    recentBusinesses.forEach(business => {
      recentActivity.push({
        type: 'business_registration',
        description: `Business "${business.businessName}" registered`,
        timestamp: business.createdAt
      });
    });

    // Recent content submissions (last 10)
    const recentContent = await Content.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('creatorId', 'profile.name')
      .populate('businessId', 'businessName')
      .select('type status createdAt')
      .lean();

    recentContent.forEach(content => {
      recentActivity.push({
        type: 'content_submission',
        description: `${content.creatorId?.profile?.name || 'Unknown'} submitted ${content.type} to ${content.businessId?.businessName || 'Unknown'}`,
        timestamp: content.createdAt
      });
    });

    // Recent milestone achievements (last 10)
    const recentMilestones = await CreatorProgress.aggregate([
      {
        $unwind: '$milestonesAchieved'
      },
      {
        $sort: { 'milestonesAchieved.achievedAt': -1 }
      },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: 'creatorId',
          foreignField: '_id',
          as: 'creator'
        }
      },
      {
        $lookup: {
          from: 'businesses',
          localField: 'businessId',
          foreignField: '_id',
          as: 'business'
        }
      },
      { $unwind: '$creator' },
      { $unwind: '$business' }
    ]);

    recentMilestones.forEach(milestone => {
      const milestoneIndex = milestone.milestonesAchieved.milestoneIndex;
      const businessMilestone = milestone.business.milestones?.[milestoneIndex];
      recentActivity.push({
        type: 'milestone_achievement',
        description: `${milestone.creator.profile?.name || 'Unknown'} achieved milestone "${businessMilestone?.rewardTitle || 'Unknown'}" at ${milestone.business.businessName || 'Unknown'}`,
        timestamp: milestone.milestonesAchieved.achievedAt
      });
    });

    // Sort all activities by timestamp and get top 20
    recentActivity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const topRecentActivity = recentActivity.slice(0, 20);

    // Compile all statistics
    const statistics = {
      userStatistics: {
        totalUsers: totalUsers,
        contentCreators: userCounts.content_creator,
        localBusinesses: userCounts.local_business,
        superAdmins: userCounts.super_admin,
        newUsersThisWeek: newUsersThisWeek,
        newUsersThisMonth: newUsersThisMonth
      },
      businessStatistics: {
        totalBusinesses: businessData.total,
        verifiedBusinesses: businessData.verified,
        unverifiedBusinesses: businessData.unverified,
        activeBusinesses: businessData.active,
        suspendedBusinesses: businessData.suspended
      },
      contentStatistics: {
        totalContent: contentData.total,
        todayContent: contentData.today,
        thisWeekContent: contentData.thisWeek,
        thisMonthContent: contentData.thisMonth,
        pendingContent: contentData.pending,
        acceptedContent: contentData.accepted,
        rejectedContent: contentData.rejected,
        platformAcceptanceRate: platformAcceptanceRate
      },
      growthCharts: {
        userGrowth: userGrowthFormatted,
        contentGrowth: contentGrowthFormatted
      },
      categoryDistribution: {
        businessesByCategory: businessesByCategory,
        contentByCategory: contentByCategory
      },
      geographicDistribution: {
        businessesByCountry: businessesByCountryFormatted,
        businessesByCity: businessesByCityFormatted
      },
      recentActivity: topRecentActivity
    };

    return res.status(200).json({
      message: 'Dashboard statistics retrieved successfully',
      statistics
    });
  } catch (error) {
    console.error('Error in getDashboardStats:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve dashboard statistics.',
      details: error.message
    });
  }
};

/**
 * GET /api/admin/categories
 * Get all categories (public route)
 * Returns categories with business counts
 */
const getAllCategories = async (req, res) => {
  try {
    // Find all categories and sort alphabetically
    const categories = await Category.find()
      .sort({ name: 1 })
      .select('name description icon createdAt')
      .lean();

    // Get business counts for each category
    const categoriesWithCounts = await Promise.all(
      categories.map(async (category) => {
        const businessCount = await Business.countDocuments({
          category: category._id
        });

        return {
          ...category,
          businessCount: businessCount
        };
      })
    );

    return res.status(200).json({
      categories: categoriesWithCounts
    });
  } catch (error) {
    console.error('Error in getAllCategories:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve categories.',
      details: error.message
    });
  }
};

/**
 * POST /api/admin/categories
 * Create a new category
 * Only accessible by super admin
 */
const createCategory = async (req, res) => {
  try {
    // Validate user is authenticated
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated. Please authenticate first.'
      });
    }

    // Get data from request body
    const { name, description, icon } = req.body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Category name is required and must be a non-empty string'
      });
    }

    // Validate description if provided
    if (description !== undefined && typeof description !== 'string') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Description must be a string'
      });
    }

    // Validate icon if provided (should be a URL)
    if (icon !== undefined && typeof icon !== 'string') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Icon must be a string (URL)'
      });
    }

    // Check if category name already exists
    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }
    });

    if (existingCategory) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Category with this name already exists'
      });
    }

    // Create new category
    const category = new Category({
      name: name.trim(),
      description: description ? description.trim() : undefined,
      icon: icon ? icon.trim() : undefined,
      createdBy: req.user._id
    });

    // Save category
    await category.save();

    return res.status(201).json({
      message: 'Category created successfully',
      category: category.toObject()
    });
  } catch (error) {
    console.error('Error in createCategory:', error);

    // Handle duplicate name error (race condition)
    if (error.code === 11000 || error.name === 'MongoServerError') {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Category with this name already exists',
        details: error.message
      });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid category data.',
        details: error.message
      });
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create category.',
      details: error.message
    });
  }
};

/**
 * PATCH /api/admin/categories/:categoryId
 * Update a category
 * Only accessible by super admin
 */
const updateCategory = async (req, res) => {
  try {
    // Validate user is authenticated
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated. Please authenticate first.'
      });
    }

    // Get categoryId from params
    const { categoryId } = req.params;

    // Validate categoryId format
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid categoryId format'
      });
    }

    // Get updated fields from body
    const { name, description, icon } = req.body;

    // Find category
    const category = await Category.findById(categoryId);

    if (!category) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Category not found'
      });
    }

    // Validate and update fields
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Category name must be a non-empty string'
        });
      }

      // Check if new name conflicts with existing category
      const existingCategory = await Category.findOne({
        _id: { $ne: categoryId },
        name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }
      });

      if (existingCategory) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'Category with this name already exists'
        });
      }

      category.name = name.trim();
    }

    if (description !== undefined) {
      if (typeof description !== 'string') {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Description must be a string'
        });
      }
      category.description = description.trim() || undefined;
    }

    if (icon !== undefined) {
      if (typeof icon !== 'string') {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Icon must be a string (URL)'
        });
      }
      category.icon = icon.trim() || undefined;
    }

    // Save updated category
    await category.save();

    return res.status(200).json({
      message: 'Category updated successfully',
      category: category.toObject()
    });
  } catch (error) {
    console.error('Error in updateCategory:', error);

    // Handle duplicate name error (race condition)
    if (error.code === 11000 || error.name === 'MongoServerError') {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Category with this name already exists',
        details: error.message
      });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid category data.',
        details: error.message
      });
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update category.',
      details: error.message
    });
  }
};

/**
 * DELETE /api/admin/categories/:categoryId
 * Delete a category
 * Only accessible by super admin
 */
const deleteCategory = async (req, res) => {
  try {
    // Validate user is authenticated
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated. Please authenticate first.'
      });
    }

    // Get categoryId from params
    const { categoryId } = req.params;

    // Validate categoryId format
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid categoryId format'
      });
    }

    // Find category by id
    const category = await Category.findById(categoryId);

    if (!category) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Category not found'
      });
    }

    // Count businesses using this category
    const businessCount = await Business.countDocuments({
      category: categoryId
    });

    // If count > 0, return 400 error
    if (businessCount > 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Cannot delete category with associated businesses',
        businessCount: businessCount
      });
    }

    // Delete category
    await Category.findByIdAndDelete(categoryId);

    return res.status(200).json({
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Error in deleteCategory:', error);

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete category.',
      details: error.message
    });
  }
};

/**
 * GET /api/admin/businesses
 * Get all businesses with filters and pagination
 * Only accessible by super admin
 */
const getAllBusinessesAdmin = async (req, res) => {
  try {
    // Validate user is authenticated
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated. Please authenticate first.'
      });
    }

    // Get query params
    const { search, category, isVerified, status, page = 1, limit = 10 } = req.query;

    // Build query object
    const query = {};

    // Add search filter (regex on businessName)
    if (search) {
      query.businessName = { $regex: search, $options: 'i' };
    }

    // Add category filter
    if (category) {
      if (!mongoose.Types.ObjectId.isValid(category)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid category ID format'
        });
      }
      query.category = category;
    }

    // Add isVerified filter
    if (isVerified !== undefined) {
      query.isVerified = isVerified === 'true' || isVerified === true;
    }

    // Add status filter
    if (status) {
      if (!['active', 'suspended'].includes(status)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid status. Must be one of: active, suspended'
        });
      }
      query.status = status;
    }

    // Convert page and limit to numbers
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Find businesses with pagination
    const [businesses, total] = await Promise.all([
      Business.find(query)
        .populate('userId', 'profile.name email')
        .populate('category', 'name description icon')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Business.countDocuments(query)
    ]);

    // For each business, get totalContent count and totalUniqueCreators count
    const businessesWithStats = await Promise.all(
      businesses.map(async (business) => {
        const [totalContent, uniqueCreatorsResult] = await Promise.all([
          Content.countDocuments({ businessId: business._id }),
          Content.aggregate([
            { $match: { businessId: business._id } },
            { $group: { _id: '$creatorId' } },
            { $count: 'totalUniqueCreators' }
          ])
        ]);

        const totalUniqueCreators = uniqueCreatorsResult[0]?.totalUniqueCreators || 0;

        return {
          ...business,
          totalContent,
          totalUniqueCreators
        };
      })
    );

    // Calculate filter counts
    const filterCounts = {
      total: await Business.countDocuments({}),
      verified: await Business.countDocuments({ isVerified: true }),
      unverified: await Business.countDocuments({ isVerified: false }),
      active: await Business.countDocuments({ status: 'active' }),
      suspended: await Business.countDocuments({ status: 'suspended' })
    };

    // Calculate total pages
    const totalPages = Math.ceil(total / limitNum);

    return res.status(200).json({
      businesses: businessesWithStats,
      total,
      currentPage: pageNum,
      totalPages,
      filterCounts
    });
  } catch (error) {
    console.error('Error in getAllBusinessesAdmin:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve businesses.',
      details: error.message
    });
  }
};

/**
 * PATCH /api/admin/businesses/:businessId/verify
 * Verify a business
 * Only accessible by super admin
 */
const verifyBusiness = async (req, res) => {
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

    // Find business by id
    const business = await Business.findById(businessId);

    if (!business) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Business not found'
      });
    }

    // Check if already verified
    if (business.isVerified) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Business is already verified'
      });
    }

    // Update business
    business.isVerified = true;
    business.verifiedBy = req.user._id;
    business.verifiedAt = Date.now();

    // Save business
    await business.save();

    // Populate fields for response
    await business.populate('userId', 'profile.name email');
    await business.populate('category', 'name description icon');

    // TODO: Send notification to business owner

    return res.status(200).json({
      message: 'Business verified successfully',
      business
    });
  } catch (error) {
    console.error('Error in verifyBusiness:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify business.',
      details: error.message
    });
  }
};

/**
 * PATCH /api/admin/businesses/:businessId/suspend
 * Suspend a business
 * Only accessible by super admin
 */
const suspendBusiness = async (req, res) => {
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

    // Get reason from request body
    const { reason } = req.body;

    // Validate reason is required
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Suspension reason is required'
      });
    }

    // Find business by id
    const business = await Business.findById(businessId);

    if (!business) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Business not found'
      });
    }

    // Update business
    business.status = 'suspended';
    business.suspensionReason = reason.trim();
    business.suspendedBy = req.user._id;
    business.suspendedAt = Date.now();

    // Save business
    await business.save();

    // TODO: Send notification to business owner

    return res.status(200).json({
      message: 'Business suspended successfully'
    });
  } catch (error) {
    console.error('Error in suspendBusiness:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to suspend business.',
      details: error.message
    });
  }
};

/**
 * PATCH /api/admin/businesses/:businessId/unsuspend
 * Unsuspend a business
 * Only accessible by super admin
 */
const unsuspendBusiness = async (req, res) => {
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

    // Find business
    const business = await Business.findById(businessId);

    if (!business) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Business not found'
      });
    }

    // Update business
    business.status = 'active';
    business.suspensionReason = undefined;
    business.suspendedBy = undefined;
    business.suspendedAt = undefined;

    // Save business
    await business.save();

    return res.status(200).json({
      message: 'Business unsuspended successfully'
    });
  } catch (error) {
    console.error('Error in unsuspendBusiness:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to unsuspend business.',
      details: error.message
    });
  }
};

/**
 * DELETE /api/admin/businesses/:businessId
 * Delete a business and all associated content
 * Only accessible by super admin
 */
const deleteBusiness = async (req, res) => {
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

    // Find business
    const business = await Business.findById(businessId);

    if (!business) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Business not found'
      });
    }

    // Count content associated with this business
    const contentCount = await Content.countDocuments({ businessId: business._id });

    // Show warning if content exists (but continue with deletion)
    if (contentCount > 0) {
      console.warn(`Warning: Deleting business ${businessId} with ${contentCount} associated content items`);
    }

    // Delete all content for this business
    const deleteContentResult = await Content.deleteMany({ businessId: business._id });
    const deletedContentCount = deleteContentResult.deletedCount;

    // Delete all CreatorProgress for this business
    const deleteProgressResult = await CreatorProgress.deleteMany({ businessId: business._id });
    const deletedProgressCount = deleteProgressResult.deletedCount;

    // Delete business
    await Business.findByIdAndDelete(businessId);

    return res.status(200).json({
      message: 'Business deleted successfully',
      deletedContentCount,
      deletedProgressCount
    });
  } catch (error) {
    console.error('Error in deleteBusiness:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete business.',
      details: error.message
    });
  }
};

/**
 * GET /api/admin/creators
 * Get all creators with statistics
 * Only accessible by super admin
 */
const getAllCreatorsAdmin = async (req, res) => {
  try {
    // Validate user is authenticated
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated. Please authenticate first.'
      });
    }

    // Get query params
    const { search, status, page = 1, limit = 10 } = req.query;

    // Build query object - role must be content_creator
    const query = {
      role: 'content_creator'
    };

    // Add search filter (regex on name or email)
    if (search) {
      query.$or = [
        { 'profile.name': { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Add status filter (isSuspended)
    if (status !== undefined) {
      if (status === 'suspended') {
        query.isSuspended = true;
      } else if (status === 'active') {
        query.isSuspended = { $ne: true };
      } else {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid status. Must be one of: active, suspended'
        });
      }
    }

    // Convert page and limit to numbers
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Find users with pagination
    const creators = await User.find(query)
      .select('profile.name profile.avatar email isSuspended suspensionReason suspendedAt createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // For each creator, aggregate statistics
    const creatorsWithStats = await Promise.all(
      creators.map(async (creator) => {
        const creatorId = creator._id;

        // Get content statistics
        const contentStats = await Content.aggregate([
          { $match: { creatorId: creatorId } },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ]);

        // Convert to object
        const statusCounts = {
          pending: 0,
          accepted: 0,
          rejected: 0
        };

        contentStats.forEach(item => {
          if (statusCounts.hasOwnProperty(item._id)) {
            statusCounts[item._id] = item.count;
          }
        });

        const totalContentSubmitted = statusCounts.pending + statusCounts.accepted + statusCounts.rejected;
        const totalContentAccepted = statusCounts.accepted;
        const totalContentRejected = statusCounts.rejected;
        const totalReviewed = totalContentAccepted + totalContentRejected;
        const acceptanceRate = totalReviewed > 0
          ? Math.round((totalContentAccepted / totalReviewed) * 100 * 100) / 100
          : 0;

        // Get points and milestones from CreatorProgress
        const progressStats = await CreatorProgress.aggregate([
          { $match: { creatorId: creatorId } },
          {
            $group: {
              _id: null,
              totalPointsEarned: { $sum: '$totalPoints' },
              totalMilestonesAchieved: {
                $sum: { $size: '$milestonesAchieved' }
              }
            }
          }
        ]);

        const totalPointsEarned = progressStats[0]?.totalPointsEarned || 0;
        const totalMilestonesAchieved = progressStats[0]?.totalMilestonesAchieved || 0;

        return {
          ...creator,
          totalContentSubmitted,
          totalContentAccepted,
          totalContentRejected,
          acceptanceRate,
          totalPointsEarned,
          totalMilestonesAchieved
        };
      })
    );

    // Sort by totalContentSubmitted descending
    creatorsWithStats.sort((a, b) => b.totalContentSubmitted - a.totalContentSubmitted);

    // Get total count
    const total = await User.countDocuments(query);

    // Calculate total pages
    const totalPages = Math.ceil(total / limitNum);

    return res.status(200).json({
      creators: creatorsWithStats,
      total,
      currentPage: pageNum,
      totalPages
    });
  } catch (error) {
    console.error('Error in getAllCreatorsAdmin:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve creators.',
      details: error.message
    });
  }
};

/**
 * GET /api/admin/creators/:creatorId
 * Get detailed creator information
 * Only accessible by super admin
 */
const getCreatorDetails = async (req, res) => {
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

    // Find user by id
    const creator = await User.findById(creatorId)
      .select('profile.name profile.avatar email role isSuspended suspensionReason suspendedBy suspendedAt createdAt updatedAt')
      .lean();

    if (!creator) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Creator not found'
      });
    }

    // Check if user is content_creator
    if (creator.role !== 'content_creator') {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User is not a content creator'
      });
    }

    // Get all content submitted with business names
    const allContent = await Content.find({ creatorId: creatorId })
      .populate('businessId', 'businessName logo category')
      .sort({ createdAt: -1 })
      .lean();

    // Get all progress records with business names
    const allProgress = await CreatorProgress.find({ creatorId: creatorId })
      .populate('businessId', 'businessName logo category')
      .sort({ updatedAt: -1 })
      .lean();

    // Calculate total stats across all businesses
    const contentStats = await Content.aggregate([
      { $match: { creatorId: creatorId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const statusCounts = {
      pending: 0,
      accepted: 0,
      rejected: 0
    };

    contentStats.forEach(item => {
      if (statusCounts.hasOwnProperty(item._id)) {
        statusCounts[item._id] = item.count;
      }
    });

    const totalContentSubmitted = statusCounts.pending + statusCounts.accepted + statusCounts.rejected;
    const totalContentAccepted = statusCounts.accepted;
    const totalContentRejected = statusCounts.rejected;
    const totalReviewed = totalContentAccepted + totalContentRejected;
    const acceptanceRate = totalReviewed > 0
      ? Math.round((totalContentAccepted / totalReviewed) * 100 * 100) / 100
      : 0;

    // Get points and milestones
    const progressStats = await CreatorProgress.aggregate([
      { $match: { creatorId: creatorId } },
      {
        $group: {
          _id: null,
          totalPointsEarned: { $sum: '$totalPoints' },
          totalMilestonesAchieved: {
            $sum: { $size: '$milestonesAchieved' }
          },
          totalBusinesses: { $sum: 1 }
        }
      }
    ]);

    const totalPointsEarned = progressStats[0]?.totalPointsEarned || 0;
    const totalMilestonesAchieved = progressStats[0]?.totalMilestonesAchieved || 0;
    const totalBusinesses = progressStats[0]?.totalBusinesses || 0;

    // Get recent activity (last 20 content submissions)
    const recentActivity = allContent.slice(0, 20).map(content => ({
      type: 'content_submission',
      businessName: content.businessId?.businessName || 'Unknown',
      contentType: content.type,
      status: content.status,
      createdAt: content.createdAt
    }));

    // Populate suspendedBy if exists
    if (creator.suspendedBy) {
      const suspendedByUser = await User.findById(creator.suspendedBy)
        .select('profile.name email')
        .lean();
      creator.suspendedByUser = suspendedByUser;
    }

    return res.status(200).json({
      creator,
      statistics: {
        totalContentSubmitted,
        totalContentAccepted,
        totalContentRejected,
        acceptanceRate,
        totalPointsEarned,
        totalMilestonesAchieved,
        totalBusinesses
      },
      content: allContent,
      progress: allProgress,
      recentActivity
    });
  } catch (error) {
    console.error('Error in getCreatorDetails:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve creator details.',
      details: error.message
    });
  }
};

/**
 * PATCH /api/admin/creators/:creatorId/suspend
 * Suspend a creator
 * Only accessible by super admin
 */
const suspendCreator = async (req, res) => {
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

    // Get reason from body
    const { reason } = req.body;

    // Validate reason is required
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Suspension reason is required'
      });
    }

    // Find user
    const user = await User.findById(creatorId);

    if (!user) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Creator not found'
      });
    }

    // Check if user is content_creator
    if (user.role !== 'content_creator') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'User is not a content creator'
      });
    }

    // Add suspension fields to user document
    user.isSuspended = true;
    user.suspensionReason = reason.trim();
    user.suspendedBy = req.user._id;
    user.suspendedAt = Date.now();

    // Save user
    await user.save();

    // TODO: Send notification

    return res.status(200).json({
      message: 'Creator suspended successfully'
    });
  } catch (error) {
    console.error('Error in suspendCreator:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to suspend creator.',
      details: error.message
    });
  }
};

/**
 * PATCH /api/admin/creators/:creatorId/unsuspend
 * Unsuspend a creator
 * Only accessible by super admin
 */
const unsuspendCreator = async (req, res) => {
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

    // Find user
    const user = await User.findById(creatorId);

    if (!user) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Creator not found'
      });
    }

    // Remove suspension fields
    user.isSuspended = false;
    user.suspensionReason = undefined;
    user.suspendedBy = undefined;
    user.suspendedAt = undefined;

    // Save user
    await user.save();

    return res.status(200).json({
      message: 'Creator unsuspended successfully'
    });
  } catch (error) {
    console.error('Error in unsuspendCreator:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to unsuspend creator.',
      details: error.message
    });
  }
};

/**
 * GET /api/admin/content
 * Get all content with filters and statistics
 * Only accessible by super admin
 */
const getAllContentAdmin = async (req, res) => {
  try {
    // Validate user is authenticated
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated. Please authenticate first.'
      });
    }

    // Get query params
    const { businessId, creatorId, status, type, startDate, endDate, page = 1, limit = 10 } = req.query;

    // Build query object
    const query = {};

    // Add businessId filter
    if (businessId) {
      if (!mongoose.Types.ObjectId.isValid(businessId)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid businessId format'
        });
      }
      query.businessId = businessId;
    }

    // Add creatorId filter
    if (creatorId) {
      if (!mongoose.Types.ObjectId.isValid(creatorId)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid creatorId format'
        });
      }
      query.creatorId = creatorId;
    }

    // Add status filter
    if (status) {
      if (!['pending', 'accepted', 'rejected'].includes(status)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid status. Must be one of: pending, accepted, rejected'
        });
      }
      query.status = status;
    }

    // Add type filter
    if (type) {
      if (!['photo', 'video'].includes(type)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid type. Must be one of: photo, video'
        });
      }
      query.type = type;
    }

    // Add date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          return res.status(400).json({
            error: 'Validation Error',
            message: 'Invalid startDate format'
          });
        }
        query.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        if (isNaN(end.getTime())) {
          return res.status(400).json({
            error: 'Validation Error',
            message: 'Invalid endDate format'
          });
        }
        // Set end date to end of day
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    // Convert page and limit to numbers
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Find content with pagination
    const contentQuery = Content.find(query)
      .populate('businessId', 'businessName category')
      .populate('creatorId', 'profile.name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const [content, total] = await Promise.all([
      contentQuery.lean(),
      Content.countDocuments(query)
    ]);

    // Populate category names for businesses
    const contentWithCategoryNames = await Promise.all(
      content.map(async (item) => {
        if (item.businessId && item.businessId.category) {
          const category = await Category.findById(item.businessId.category)
            .select('name')
            .lean();
          if (category) {
            item.businessId.categoryName = category.name;
          }
        }
        return item;
      })
    );

    // Calculate statistics using aggregation
    const [statusStats, typeStats, pointsStats, acceptanceStats] = await Promise.all([
      // Total by status
      Content.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),
      // Total by type
      Content.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 }
          }
        }
      ]),
      // Total points awarded
      Content.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalPoints: { $sum: '$points' }
          }
        }
      ]),
      // Acceptance rate calculation
      Content.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    // Format status statistics
    const statusCounts = {
      pending: 0,
      accepted: 0,
      rejected: 0
    };
    statusStats.forEach(item => {
      if (statusCounts.hasOwnProperty(item._id)) {
        statusCounts[item._id] = item.count;
      }
    });

    // Format type statistics
    const typeCounts = {
      photo: 0,
      video: 0
    };
    typeStats.forEach(item => {
      if (typeCounts.hasOwnProperty(item._id)) {
        typeCounts[item._id] = item.count;
      }
    });

    // Calculate average acceptance rate
    const acceptedCount = statusCounts.accepted;
    const rejectedCount = statusCounts.rejected;
    const totalReviewed = acceptedCount + rejectedCount;
    const averageAcceptanceRate = totalReviewed > 0
      ? Math.round((acceptedCount / totalReviewed) * 100 * 100) / 100
      : 0;

    // Get total points awarded
    const totalPointsAwarded = pointsStats[0]?.totalPoints || 0;

    // Calculate total pages
    const totalPages = Math.ceil(total / limitNum);

    return res.status(200).json({
      content: contentWithCategoryNames,
      total,
      currentPage: pageNum,
      totalPages,
      statistics: {
        byStatus: statusCounts,
        byType: typeCounts,
        averageAcceptanceRate,
        totalPointsAwarded
      }
    });
  } catch (error) {
    console.error('Error in getAllContentAdmin:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve content.',
      details: error.message
    });
  }
};

/**
 * GET /api/admin/reports
 * Generate various reports
 * Only accessible by super admin
 */
const generateReport = async (req, res) => {
  try {
    // Validate user is authenticated
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated. Please authenticate first.'
      });
    }

    // Get query params
    const { reportType, startDate, endDate, businessId, creatorId, format = 'json' } = req.query;

    // Validate reportType
    if (!reportType || !['content_generation', 'business_performance', 'creator_activity'].includes(reportType)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid reportType. Must be one of: content_generation, business_performance, creator_activity'
      });
    }

    // Validate format
    if (!['json', 'csv'].includes(format)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid format. Must be one of: json, csv'
      });
    }

    // Validate and parse dates
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          return res.status(400).json({
            error: 'Validation Error',
            message: 'Invalid startDate format'
          });
        }
        dateFilter.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        if (isNaN(end.getTime())) {
          return res.status(400).json({
            error: 'Validation Error',
            message: 'Invalid endDate format'
          });
        }
        end.setHours(23, 59, 59, 999);
        dateFilter.createdAt.$lte = end;
      }
    }

    // Validate optional filters
    if (businessId && !mongoose.Types.ObjectId.isValid(businessId)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid businessId format'
      });
    }

    if (creatorId && !mongoose.Types.ObjectId.isValid(creatorId)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid creatorId format'
      });
    }

    let reportData = {};

    // Generate report based on reportType
    if (reportType === 'content_generation') {
      reportData = await generateContentGenerationReport(dateFilter, businessId, creatorId);
    } else if (reportType === 'business_performance') {
      reportData = await generateBusinessPerformanceReport(dateFilter, businessId);
    } else if (reportType === 'creator_activity') {
      reportData = await generateCreatorActivityReport(dateFilter, creatorId);
    }

    // Return JSON or CSV based on format
    if (format === 'json') {
      return res.status(200).json({
        reportType,
        dateRange: {
          startDate: startDate || null,
          endDate: endDate || null
        },
        filters: {
          businessId: businessId || null,
          creatorId: creatorId || null
        },
        data: reportData
      });
    } else {
      // Generate CSV
      const csvData = flattenReportData(reportData, reportType);
      const parser = new Parser();
      const csv = parser.parse(csvData);

      // Set headers for file download
      const filename = `${reportType}_${new Date().toISOString().split('T')[0]}.csv`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      return res.status(200).send(csv);
    }
  } catch (error) {
    console.error('Error in generateReport:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to generate report.',
      details: error.message
    });
  }
};

/**
 * Generate Content Generation Report
 */
const generateContentGenerationReport = async (dateFilter, businessId, creatorId) => {
  const contentQuery = { ...dateFilter };
  if (businessId) contentQuery.businessId = businessId;
  if (creatorId) contentQuery.creatorId = creatorId;

  // Total content in date range
  const totalContent = await Content.countDocuments(contentQuery);

  // Breakdown by business
  const byBusiness = await Content.aggregate([
    { $match: contentQuery },
    {
      $lookup: {
        from: 'businesses',
        localField: 'businessId',
        foreignField: '_id',
        as: 'business'
      }
    },
    { $unwind: '$business' },
    {
      $group: {
        _id: '$businessId',
        businessName: { $first: '$business.businessName' },
        count: { $sum: 1 },
        accepted: { $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } }
      }
    },
    { $sort: { count: -1 } }
  ]);

  // Breakdown by creator
  const byCreator = await Content.aggregate([
    { $match: contentQuery },
    {
      $lookup: {
        from: 'users',
        localField: 'creatorId',
        foreignField: '_id',
        as: 'creator'
      }
    },
    { $unwind: '$creator' },
    {
      $group: {
        _id: '$creatorId',
        creatorName: { $first: '$creator.profile.name' },
        creatorEmail: { $first: '$creator.email' },
        count: { $sum: 1 },
        accepted: { $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } }
      }
    },
    { $sort: { count: -1 } }
  ]);

  // Breakdown by status
  const byStatus = await Content.aggregate([
    { $match: contentQuery },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  const statusCounts = { pending: 0, accepted: 0, rejected: 0 };
  byStatus.forEach(item => {
    if (statusCounts.hasOwnProperty(item._id)) {
      statusCounts[item._id] = item.count;
    }
  });

  // Breakdown by type
  const byType = await Content.aggregate([
    { $match: contentQuery },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 }
      }
    }
  ]);

  const typeCounts = { photo: 0, video: 0 };
  byType.forEach(item => {
    if (typeCounts.hasOwnProperty(item._id)) {
      typeCounts[item._id] = item.count;
    }
  });

  // Acceptance rates
  const totalReviewed = statusCounts.accepted + statusCounts.rejected;
  const overallAcceptanceRate = totalReviewed > 0
    ? Math.round((statusCounts.accepted / totalReviewed) * 100 * 100) / 100
    : 0;

  // Peak submission times/days
  const peakTimes = await Content.aggregate([
    { $match: contentQuery },
    {
      $group: {
        _id: {
          hour: { $hour: '$createdAt' },
          dayOfWeek: { $dayOfWeek: '$createdAt' }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);

  const peakDays = await Content.aggregate([
    { $match: contentQuery },
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
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);

  // Geographic distribution
  const geographicDistribution = await Content.aggregate([
    { $match: contentQuery },
    {
      $lookup: {
        from: 'businesses',
        localField: 'businessId',
        foreignField: '_id',
        as: 'business'
      }
    },
    { $unwind: '$business' },
    {
      $group: {
        _id: {
          country: '$business.location.country',
          city: '$business.location.city'
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);

  return {
    summary: {
      totalContent,
      byStatus: statusCounts,
      byType: typeCounts,
      overallAcceptanceRate
    },
    breakdownByBusiness: byBusiness,
    breakdownByCreator: byCreator,
    peakSubmissionTimes: peakTimes,
    peakSubmissionDays: peakDays,
    geographicDistribution
  };
};

/**
 * Generate Business Performance Report
 */
const generateBusinessPerformanceReport = async (dateFilter, businessId) => {
  const businessQuery = businessId ? { _id: businessId } : {};
  const businesses = await Business.find(businessQuery).lean();

  const businessReports = await Promise.all(
    businesses.map(async (business) => {
      const contentQuery = {
        ...dateFilter,
        businessId: business._id
      };

      // Total content received
      const totalContent = await Content.countDocuments(contentQuery);

      // Unique creators engaged
      const uniqueCreatorsResult = await Content.aggregate([
        { $match: contentQuery },
        { $group: { _id: '$creatorId' } },
        { $count: 'totalUniqueCreators' }
      ]);
      const uniqueCreators = uniqueCreatorsResult[0]?.totalUniqueCreators || 0;

      // Acceptance rate
      const statusStats = await Content.aggregate([
        { $match: contentQuery },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      const statusCounts = { pending: 0, accepted: 0, rejected: 0 };
      statusStats.forEach(item => {
        if (statusCounts.hasOwnProperty(item._id)) {
          statusCounts[item._id] = item.count;
        }
      });

      const totalReviewed = statusCounts.accepted + statusCounts.rejected;
      const acceptanceRate = totalReviewed > 0
        ? Math.round((statusCounts.accepted / totalReviewed) * 100 * 100) / 100
        : 0;

      // Points awarded
      const pointsStats = await Content.aggregate([
        { $match: contentQuery },
        {
          $group: {
            _id: null,
            totalPoints: { $sum: '$points' }
          }
        }
      ]);
      const pointsAwarded = pointsStats[0]?.totalPoints || 0;

      // Milestones created vs achieved
      const milestonesCreated = business.milestones?.length || 0;
      const milestonesAchieved = await CreatorProgress.aggregate([
        { $match: { businessId: business._id } },
        {
          $group: {
            _id: null,
            totalAchieved: { $sum: { $size: '$milestonesAchieved' } }
          }
        }
      ]);
      const totalMilestonesAchieved = milestonesAchieved[0]?.totalAchieved || 0;

      // Top contributors
      const topContributors = await Content.aggregate([
        { $match: contentQuery },
        {
          $lookup: {
            from: 'users',
            localField: 'creatorId',
            foreignField: '_id',
            as: 'creator'
          }
        },
        { $unwind: '$creator' },
        {
          $group: {
            _id: '$creatorId',
            creatorName: { $first: '$creator.profile.name' },
            submissionCount: { $sum: 1 },
            acceptedCount: { $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] } }
          }
        },
        { $sort: { submissionCount: -1 } },
        { $limit: 10 }
      ]);

      // Activity trend over time
      const activityTrend = await Content.aggregate([
        { $match: contentQuery },
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

      // Get category name
      const category = await Category.findById(business.category)
        .select('name')
        .lean();

      return {
        businessId: business._id,
        businessName: business.businessName,
        category: category?.name || 'Unknown',
        totalContentReceived: totalContent,
        uniqueCreatorsEngaged: uniqueCreators,
        acceptanceRate,
        pointsAwarded,
        milestones: {
          created: milestonesCreated,
          achieved: totalMilestonesAchieved,
          achievementRate: milestonesCreated > 0
            ? Math.round((totalMilestonesAchieved / milestonesCreated) * 100 * 100) / 100
            : 0
        },
        topContributors,
        activityTrend
      };
    })
  );

  return {
    businesses: businessReports
  };
};

/**
 * Generate Creator Activity Report
 */
const generateCreatorActivityReport = async (dateFilter, creatorId) => {
  const creatorQuery = creatorId ? { _id: creatorId } : { role: 'content_creator' };
  const creators = await User.find(creatorQuery).lean();

  const creatorReports = await Promise.all(
    creators.map(async (creator) => {
      const contentQuery = {
        ...dateFilter,
        creatorId: creator._id
      };

      // Total submissions
      const totalSubmissions = await Content.countDocuments(contentQuery);

      // Acceptance rate
      const statusStats = await Content.aggregate([
        { $match: contentQuery },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      const statusCounts = { pending: 0, accepted: 0, rejected: 0 };
      statusStats.forEach(item => {
        if (statusCounts.hasOwnProperty(item._id)) {
          statusCounts[item._id] = item.count;
        }
      });

      const totalReviewed = statusCounts.accepted + statusCounts.rejected;
      const acceptanceRate = totalReviewed > 0
        ? Math.round((statusCounts.accepted / totalReviewed) * 100 * 100) / 100
        : 0;

      // Businesses engaged with
      const businessesEngaged = await Content.aggregate([
        { $match: contentQuery },
        {
          $lookup: {
            from: 'businesses',
            localField: 'businessId',
            foreignField: '_id',
            as: 'business'
          }
        },
        { $unwind: '$business' },
        {
          $group: {
            _id: '$businessId',
            businessName: { $first: '$business.businessName' },
            submissionCount: { $sum: 1 }
          }
        },
        { $sort: { submissionCount: -1 } }
      ]);

      // Points earned
      const pointsStats = await CreatorProgress.aggregate([
        { $match: { creatorId: creator._id } },
        {
          $group: {
            _id: null,
            totalPoints: { $sum: '$totalPoints' }
          }
        }
      ]);
      const pointsEarned = pointsStats[0]?.totalPoints || 0;

      // Milestones achieved
      const milestonesStats = await CreatorProgress.aggregate([
        { $match: { creatorId: creator._id } },
        {
          $group: {
            _id: null,
            totalMilestones: { $sum: { $size: '$milestonesAchieved' } }
          }
        }
      ]);
      const milestonesAchieved = milestonesStats[0]?.totalMilestones || 0;

      // Favorite category
      const categoryStats = await Content.aggregate([
        { $match: contentQuery },
        {
          $lookup: {
            from: 'businesses',
            localField: 'businessId',
            foreignField: '_id',
            as: 'business'
          }
        },
        { $unwind: '$business' },
        {
          $group: {
            _id: '$business.category',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 1 }
      ]);

      let favoriteCategory = 'None';
      if (categoryStats.length > 0) {
        const category = await Category.findById(categoryStats[0]._id)
          .select('name')
          .lean();
        favoriteCategory = category?.name || 'Unknown';
      }

      // Activity trend
      const activityTrend = await Content.aggregate([
        { $match: contentQuery },
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

      return {
        creatorId: creator._id,
        creatorName: creator.profile.name,
        creatorEmail: creator.email,
        totalSubmissions,
        acceptanceRate,
        businessesEngaged: businessesEngaged.length,
        businessesEngagedDetails: businessesEngaged,
        pointsEarned,
        milestonesAchieved,
        favoriteCategory,
        activityTrend
      };
    })
  );

  return {
    creators: creatorReports
  };
};

/**
 * Flatten report data for CSV export
 */
const flattenReportData = (reportData, reportType) => {
  const flattened = [];

  if (reportType === 'content_generation') {
    // Flatten summary
    flattened.push({
      type: 'Summary',
      totalContent: reportData.summary.totalContent,
      pending: reportData.summary.byStatus.pending,
      accepted: reportData.summary.byStatus.accepted,
      rejected: reportData.summary.byStatus.rejected,
      photo: reportData.summary.byType.photo,
      video: reportData.summary.byType.video,
      acceptanceRate: reportData.summary.overallAcceptanceRate
    });

    // Flatten by business
    reportData.breakdownByBusiness.forEach(business => {
      flattened.push({
        type: 'Business Breakdown',
        businessName: business.businessName,
        totalContent: business.count,
        accepted: business.accepted,
        rejected: business.rejected,
        pending: business.pending
      });
    });

    // Flatten by creator
    reportData.breakdownByCreator.forEach(creator => {
      flattened.push({
        type: 'Creator Breakdown',
        creatorName: creator.creatorName,
        creatorEmail: creator.creatorEmail,
        totalContent: creator.count,
        accepted: creator.accepted,
        rejected: creator.rejected
      });
    });
  } else if (reportType === 'business_performance') {
    reportData.businesses.forEach(business => {
      flattened.push({
        businessName: business.businessName,
        category: business.category,
        totalContentReceived: business.totalContentReceived,
        uniqueCreatorsEngaged: business.uniqueCreatorsEngaged,
        acceptanceRate: business.acceptanceRate,
        pointsAwarded: business.pointsAwarded,
        milestonesCreated: business.milestones.created,
        milestonesAchieved: business.milestones.achieved,
        milestonesAchievementRate: business.milestones.achievementRate
      });
    });
  } else if (reportType === 'creator_activity') {
    reportData.creators.forEach(creator => {
      flattened.push({
        creatorName: creator.creatorName,
        creatorEmail: creator.creatorEmail,
        totalSubmissions: creator.totalSubmissions,
        acceptanceRate: creator.acceptanceRate,
        businessesEngaged: creator.businessesEngaged,
        pointsEarned: creator.pointsEarned,
        milestonesAchieved: creator.milestonesAchieved,
        favoriteCategory: creator.favoriteCategory
      });
    });
  }

  return flattened;
};

module.exports = {
  getDashboardStats,
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getAllBusinessesAdmin,
  verifyBusiness,
  suspendBusiness,
  unsuspendBusiness,
  deleteBusiness,
  getAllCreatorsAdmin,
  getCreatorDetails,
  suspendCreator,
  unsuspendCreator,
  getAllContentAdmin,
  generateReport
};
