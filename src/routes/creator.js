const express = require('express');
const router = express.Router();
const { verifyClerkToken } = require('../middleware/clerkAuth');
const { isContentCreator } = require('../middleware/roleCheck');
const { uploadSingle } = require('../middleware/uploadFile');
const {
  getAllBusinesses,
  getBusinessDetails
} = require('../controllers/creatorController');
const {
  submitContent,
  getMyContent,
  getMyContentForBusiness,
  getCreatorProgress
} = require('../controllers/contentController');

// All routes are protected with verifyClerkToken + isContentCreator

// GET /api/creator/businesses - Get all verified and active businesses
router.get('/businesses',
  verifyClerkToken,
  isContentCreator,
  getAllBusinesses
);

// GET /api/creator/businesses/:businessId - Get business details
router.get('/businesses/:businessId',
  verifyClerkToken,
  isContentCreator,
  getBusinessDetails
);

// POST /api/creator/content/submit - Submit content (photo or video)
router.post('/content/submit',
  verifyClerkToken,
  isContentCreator,
  ...uploadSingle('file'),
  submitContent
);

// GET /api/creator/content/my-content - Get all content submitted by creator
router.get('/content/my-content',
  verifyClerkToken,
  isContentCreator,
  getMyContent
);

// GET /api/creator/content/business/:businessId - Get content for specific business
router.get('/content/business/:businessId',
  verifyClerkToken,
  isContentCreator,
  getMyContentForBusiness
);

// GET /api/creator/progress/:businessId - Get creator progress for business
router.get('/progress/:businessId',
  verifyClerkToken,
  isContentCreator,
  getCreatorProgress
);

module.exports = router;
