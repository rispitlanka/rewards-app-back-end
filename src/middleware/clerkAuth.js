const { clerkClient } = require('@clerk/clerk-sdk-node');
const User = require('../models/User');
require('dotenv').config();

// Clerk secret key is required for protected routes; warn if missing
if (!process.env.CLERK_SECRET_KEY) {
  console.warn('Warning: CLERK_SECRET_KEY is not set in .env — auth-protected routes will fail until you add it.');
}

/**
 * Middleware to verify Clerk authentication token
 * Extracts user from token, finds or creates user in MongoDB, and attaches to req.user
 */
const verifyClerkToken = async (req, res, next) => {
  try {
    // Extract Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No authorization header provided. Please include a Bearer token.'
      });
    }

    // Extract Bearer token
    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;

    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No token provided. Please include a Bearer token in the Authorization header.'
      });
    }

    // Verify token using Clerk
    let clerkUser;
    try {
      clerkUser = await clerkClient.verifyToken(token);
    } catch (clerkError) {
      console.error('Clerk token verification error:', clerkError.message);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token. Please authenticate again.',
        details: clerkError.message
      });
    }

    // Extract user information from verified token
    const clerkId = clerkUser.sub || clerkUser.id;
    const email = clerkUser.email || clerkUser.emailAddresses?.[0]?.emailAddress;
    const name = clerkUser.firstName && clerkUser.lastName
      ? `${clerkUser.firstName} ${clerkUser.lastName}`
      : clerkUser.firstName || clerkUser.lastName || clerkUser.username || 'User';
    const role = clerkUser.publicMetadata?.role || clerkUser.privateMetadata?.role || 'content_creator';

    if (!clerkId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Unable to extract user ID from token.'
      });
    }

    if (!email) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Unable to extract email from token.'
      });
    }

    // Find or create user in MongoDB based on clerkId
    let user = await User.findOne({ clerkId });

    if (!user) {
      // Create new user if doesn't exist
      try {
        user = new User({
          clerkId,
          email,
          role,
          profile: {
            name: name
          }
        });

        await user.save();
        console.log(`New user created: ${clerkId} (${email})`);
      } catch (createError) {
        console.error('Error creating user:', createError.message);
        
        // Handle duplicate key error (race condition)
        if (createError.code === 11000) {
          user = await User.findOne({ clerkId });
          if (!user) {
            return res.status(500).json({
              error: 'Database Error',
              message: 'Failed to create user. Please try again.',
              details: createError.message
            });
          }
        } else {
          return res.status(500).json({
            error: 'Database Error',
            message: 'Failed to create user in database.',
            details: createError.message
          });
        }
      }
    }

    // Attach user object to req.user
    req.user = user;
    
    // Call next() to proceed to next middleware/route handler
    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred during authentication.',
      details: error.message
    });
  }
};

module.exports = { verifyClerkToken };
