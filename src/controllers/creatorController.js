const Business = require('../models/Business');
const mongoose = require('mongoose');

/**
 * GET /api/creator/businesses
 * Get all verified and active businesses with filtering, search, and geospatial queries
 * Query params: category, search, latitude, longitude, radius (default 40km), page, limit
 */
const getAllBusinesses = async (req, res) => {
  try {
    const { category, search, latitude, longitude, radius = 40, page = 1, limit = 10 } = req.query;

    // Build query object
    const query = {
      isVerified: true,
      status: 'active'
    };

    // Filter by category if provided
    if (category) {
      if (!mongoose.Types.ObjectId.isValid(category)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid category ID format'
        });
      }
      query.category = category;
    }

    // Filter by search term (case insensitive regex on businessName)
    if (search) {
      query.businessName = { $regex: search, $options: 'i' };
    }

    // Convert page and limit to numbers
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Build find query
    let findQuery = Business.find(query);
    let countQuery = query;

    // If latitude and longitude provided, use geospatial query
    if (latitude && longitude) {
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      const radiusKm = parseFloat(radius) || 40;

      // Validate coordinates
      if (isNaN(lat) || lat < -90 || lat > 90) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Latitude must be a valid number between -90 and 90'
        });
      }

      if (isNaN(lng) || lng < -180 || lng > 180) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Longitude must be a valid number between -180 and 180'
        });
      }

      // Convert radius from km to meters (for $maxDistance)
      const radiusInMeters = radiusKm * 1000;

      // Use $near for geospatial query with distance calculation (for find)
      findQuery = Business.find({
        ...query,
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [lng, lat] // [longitude, latitude] as per GeoJSON spec
            },
            $maxDistance: radiusInMeters // $maxDistance is in meters
          }
        }
      });

      // Use $geoWithin for count query (countDocuments doesn't support $near)
      // Convert radius from km to radians for $centerSphere
      const radiusInRadians = radiusKm / 6378.1;
      countQuery = {
        ...query,
        location: {
          $geoWithin: {
            $centerSphere: [[lng, lat], radiusInRadians]
          }
        }
      };
    }

    // Populate category details
    findQuery = findQuery.populate('category', 'name description');

    // Sort: by distance if location provided, otherwise by businessName
    if (latitude && longitude) {
      // When using $near, results are automatically sorted by distance
      // No need to add explicit sort
    } else {
      findQuery = findQuery.sort({ businessName: 1 });
    }

    // Execute query with pagination
    const [businesses, total] = await Promise.all([
      findQuery.skip(skip).limit(limitNum).lean(),
      Business.countDocuments(countQuery)
    ]);

    // Calculate total pages
    const totalPages = Math.ceil(total / limitNum);

    // If location was provided, calculate distance for each business
    let businessesWithDistance = businesses;
    if (latitude && longitude) {
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      
      businessesWithDistance = businesses.map(business => {
        const [businessLng, businessLat] = business.location.coordinates;
        
        // Calculate distance using Haversine formula
        const R = 6371; // Earth's radius in km
        const dLat = (businessLat - lat) * Math.PI / 180;
        const dLng = (businessLng - lng) * Math.PI / 180;
        const a = 
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat * Math.PI / 180) * Math.cos(businessLat * Math.PI / 180) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        return {
          ...business,
          distance: Math.round(distance * 100) / 100 // Round to 2 decimal places
        };
      });
    }

    return res.status(200).json({
      businesses: businessesWithDistance,
      total,
      currentPage: pageNum,
      totalPages
    });
  } catch (error) {
    console.error('Error in getAllBusinesses:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve businesses.',
      details: error.message
    });
  }
};

/**
 * GET /api/creator/businesses/:businessId
 * Get business details by ID
 * Only returns verified and active businesses
 */
const getBusinessDetails = async (req, res) => {
  try {
    const { businessId } = req.params;

    // Validate businessId format
    if (!mongoose.Types.ObjectId.isValid(businessId)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid business ID format'
      });
    }

    // Find business by id and populate category
    const business = await Business.findById(businessId)
      .populate('category', 'name description')
      .lean();

    // Check if business exists
    if (!business) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Business not found'
      });
    }

    // Check if business is verified and active
    if (!business.isVerified || business.status !== 'active') {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Business not found or not available'
      });
    }

    return res.status(200).json({
      business
    });
  } catch (error) {
    console.error('Error in getBusinessDetails:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve business details.',
      details: error.message
    });
  }
};

module.exports = {
  getAllBusinesses,
  getBusinessDetails
};
