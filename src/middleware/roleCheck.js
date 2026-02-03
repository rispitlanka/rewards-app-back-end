/**
 * Middleware to check if user has required role
 * Must be used after verifyClerkToken middleware to ensure req.user exists
 */

/**
 * Check if req.user exists (should be set by verifyClerkToken middleware)
 */
const checkUserExists = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'User not authenticated. Please authenticate first.'
    });
  }
  next();
};

/**
 * Middleware to check if user is a content creator
 */
const isContentCreator = (req, res, next) => {
  // First check if user exists
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'User not authenticated. Please authenticate first.'
    });
  }

  if (req.user.role === 'content_creator') {
    return next();
  }

  return res.status(403).json({
    error: 'Forbidden',
    message: 'Access denied. Content creator role required.'
  });
};

/**
 * Middleware to check if user is a local business
 */
const isLocalBusiness = (req, res, next) => {
  // First check if user exists
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'User not authenticated. Please authenticate first.'
    });
  }

  if (req.user.role === 'local_business') {
    return next();
  }

  return res.status(403).json({
    error: 'Forbidden',
    message: 'Access denied. Local business role required.'
  });
};

/**
 * Middleware to check if user is a super admin
 */
const isSuperAdmin = (req, res, next) => {
  // First check if user exists
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'User not authenticated. Please authenticate first.'
    });
  }

  if (req.user.role === 'super_admin') {
    return next();
  }

  return res.status(403).json({
    error: 'Forbidden',
    message: 'Access denied. Super admin role required.'
  });
};

/**
 * Higher-order function that returns middleware to check if user has one of the allowed roles
 * @param {string[]} roles - Array of allowed role names
 * @returns {Function} Middleware function
 */
const hasRole = (roles) => {
  if (!Array.isArray(roles) || roles.length === 0) {
    throw new Error('hasRole requires a non-empty array of roles');
  }

  return (req, res, next) => {
    // First check if user exists
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated. Please authenticate first.'
      });
    }

    if (roles.includes(req.user.role)) {
      return next();
    }

    return res.status(403).json({
      error: 'Forbidden',
      message: `Access denied. Required role: ${roles.join(' or ')}.`
    });
  };
};

module.exports = {
  isContentCreator,
  isLocalBusiness,
  isSuperAdmin,
  hasRole
};
