const { createClerkClient } = require('@clerk/clerk-sdk-node');
const User = require('../models/User');
require('dotenv').config();

// Clerk secret key is required for protected routes; warn if missing
if (!process.env.CLERK_SECRET_KEY) {
  console.warn('Warning: CLERK_SECRET_KEY is not set in .env — auth-protected routes will fail until you add it.');
}

// Initialize Clerk client with secret key
// This ensures JWK resolution works properly by explicitly setting the secret key
const clerkClient = process.env.CLERK_SECRET_KEY 
  ? createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
  : null;

if (!clerkClient) {
  console.error('Error: Clerk client not initialized. CLERK_SECRET_KEY is required.');
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

    // Check if Clerk client is initialized
    if (!clerkClient) {
      return res.status(500).json({
        error: 'Server Configuration Error',
        message: 'Clerk authentication is not properly configured. Please check CLERK_SECRET_KEY in environment variables.'
      });
    }

    // Verify token using Clerk
    let clerkUser;
    try {
      clerkUser = await clerkClient.verifyToken(token);
    } catch (clerkError) {
      console.error('Clerk token verification error:', clerkError.message);
      console.error('Full error:', clerkError);
      
      // Provide more helpful error messages
      let errorMessage = 'Invalid or expired token. Please authenticate again.';
      if (clerkError.message && clerkError.message.includes('JWK')) {
        errorMessage = 'Token verification failed. Please ensure CLERK_SECRET_KEY is correct and the server has internet access to fetch JWKs.';
      }
      
      return res.status(401).json({
        error: 'Unauthorized',
        message: errorMessage,
        details: clerkError.message
      });
    }

    // Debug: Log the token structure to understand what we're working with (only in development)
    if (process.env.NODE_ENV !== 'production') {
      console.log('Clerk token payload keys:', Object.keys(clerkUser));
      console.log('Email fields:', {
        email: clerkUser.email,
        emailAddresses: clerkUser.emailAddresses,
        primaryEmailAddress: clerkUser.primaryEmailAddress
      });
    }

    // Extract user information from verified token
    const clerkId = clerkUser.sub || clerkUser.id || clerkUser.userId;
    
    // Try multiple ways to extract email
    let email = clerkUser.email 
      || clerkUser.emailAddresses?.[0]?.emailAddress
      || clerkUser.primaryEmailAddress
      || (Array.isArray(clerkUser.emailAddresses) && clerkUser.emailAddresses.length > 0 
          ? clerkUser.emailAddresses.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress
          : null);
    
    const name = clerkUser.firstName && clerkUser.lastName
      ? `${clerkUser.firstName} ${clerkUser.lastName}`
      : clerkUser.firstName || clerkUser.lastName || clerkUser.username || clerkUser.name || 'User';
    const role = clerkUser.publicMetadata?.role || clerkUser.privateMetadata?.role || 'content_creator';

    if (!clerkId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Unable to extract user ID from token.',
        debug: { tokenKeys: Object.keys(clerkUser) }
      });
    }

    // If email is not in token, try to fetch user from Clerk API
    if (!email && clerkId) {
      try {
        console.log(`Email not found in token, fetching user ${clerkId} from Clerk API...`);
        const fullUser = await clerkClient.users.getUser(clerkId);
        email = fullUser.emailAddresses?.[0]?.emailAddress 
          || fullUser.primaryEmailAddress?.emailAddress
          || fullUser.emailAddresses?.find(e => e.id === fullUser.primaryEmailAddressId)?.emailAddress;
        console.log(`Fetched email from Clerk API: ${email || 'not found'}`);
      } catch (fetchError) {
        console.error('Error fetching user from Clerk API:', fetchError.message);
        // Continue without email - we'll check if user exists in DB
      }
    }

    // If still no email, check if user exists in database (they might have been created via sync)
    if (!email) {
      const existingUser = await User.findOne({ clerkId });
      if (existingUser && existingUser.email) {
        email = existingUser.email;
        console.log(`Using email from existing user in database: ${email}`);
      } else {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Unable to extract email from token and user not found in database. Please ensure your Clerk account has an email address.',
          debug: { 
            clerkId,
            tokenKeys: Object.keys(clerkUser),
            hasEmailAddresses: !!clerkUser.emailAddresses
          }
        });
      }
    }

    // Find or create user in MongoDB based on clerkId
    let user = await User.findOne({ clerkId });

    if (!user) {
      // Validate data before creating user
      if (!email || !email.trim()) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Email is required but was not found in token or database.',
          debug: { clerkId, hasEmail: !!email }
        });
      }

      // Basic email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const trimmedEmail = email.trim().toLowerCase();
      if (!emailRegex.test(trimmedEmail)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid email format.',
          debug: { clerkId, email: trimmedEmail }
        });
      }

      if (!name || !name.trim()) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Name is required but was not found in token.',
          debug: { clerkId }
        });
      }

      // Ensure role is valid
      const validRoles = ['content_creator', 'local_business', 'super_admin'];
      const finalRole = validRoles.includes(role) ? role : 'content_creator';

      // Create new user if doesn't exist
      try {
        user = new User({
          clerkId,
          email: trimmedEmail,
          role: finalRole,
          profile: {
            name: name.trim()
          }
        });

        await user.save();
        console.log(`New user created: ${clerkId} (${email})`);
      } catch (createError) {
        console.error('Error creating user:', createError.message);
        console.error('Full error:', createError);
        
        // Handle validation errors
        if (createError.name === 'ValidationError') {
          const validationErrors = Object.keys(createError.errors || {}).map(key => ({
            field: key,
            message: createError.errors[key].message
          }));
          
          return res.status(400).json({
            error: 'Validation Error',
            message: 'Failed to create user due to validation errors.',
            details: createError.message,
            validationErrors
          });
        }
        
        // Handle duplicate key error (race condition)
        if (createError.code === 11000) {
          // Try to find the user that was created by another request
          user = await User.findOne({ clerkId });
          if (!user) {
            // Also check if email already exists
            user = await User.findOne({ email: trimmedEmail });
            if (user) {
              // Update existing user with clerkId if it doesn't have one
              if (!user.clerkId) {
                user.clerkId = clerkId;
                await user.save();
                console.log(`Updated existing user with clerkId: ${clerkId} (${trimmedEmail})`);
              } else {
                return res.status(409).json({
                  error: 'Conflict',
                  message: 'User with this email already exists with a different Clerk ID.',
                  details: createError.message
                });
              }
            } else {
              return res.status(500).json({
                error: 'Database Error',
                message: 'Failed to create user due to duplicate key error. Please try again.',
                details: createError.message
              });
            }
          } else {
            console.log(`User found after duplicate key error: ${clerkId}`);
          }
        } else {
          return res.status(500).json({
            error: 'Database Error',
            message: 'Failed to create user in database.',
            details: createError.message,
            errorName: createError.name,
            errorCode: createError.code
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
