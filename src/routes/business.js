const express = require('express');
const router = express.Router();
const { verifyClerkToken } = require('../middleware/clerkAuth');
const { isLocalBusiness } = require('../middleware/roleCheck');
const {
  registerBusiness,
  validateBusinessRegistration,
  getMyBusiness,
  updateContentSettings,
  validateContentSettings,
  createMilestone,
  validateMilestone,
  updateMilestone,
  deleteMilestone,
  getMilestones,
  getBusinessStats
} = require('../controllers/businessController');
const {
  getPendingContent,
  getAllBusinessContent,
  getContentByCreator,
  acceptContent,
  rejectContent
} = require('../controllers/contentController');

// POST /api/business/register - Register new business
router.post('/register', 
  verifyClerkToken,
  isLocalBusiness,
  validateBusinessRegistration,
  registerBusiness
);

// GET /api/business/my-business - Get current user's business
router.get('/my-business',
  verifyClerkToken,
  isLocalBusiness,
  getMyBusiness
);

// PATCH /api/business/content-settings - Update content settings
router.patch('/content-settings',
  verifyClerkToken,
  isLocalBusiness,
  validateContentSettings,
  updateContentSettings
);

// POST /api/business/milestones - Create new milestone
router.post('/milestones',
  verifyClerkToken,
  isLocalBusiness,
  validateMilestone,
  createMilestone
);

// PATCH /api/business/milestones/:milestoneId - Update milestone
router.patch('/milestones/:milestoneId',
  verifyClerkToken,
  isLocalBusiness,
  updateMilestone
);

// DELETE /api/business/milestones/:milestoneId - Delete milestone
router.delete('/milestones/:milestoneId',
  verifyClerkToken,
  isLocalBusiness,
  deleteMilestone
);

// GET /api/business/stats - Get business statistics
router.get('/stats',
  verifyClerkToken,
  isLocalBusiness,
  getBusinessStats
);

// GET /api/business/content/pending - Get pending content
router.get('/content/pending',
  verifyClerkToken,
  isLocalBusiness,
  getPendingContent
);

// GET /api/business/content/all - Get all business content with filters
router.get('/content/all',
  verifyClerkToken,
  isLocalBusiness,
  getAllBusinessContent
);

// GET /api/business/content/creator/:creatorId - Get content by creator
router.get('/content/creator/:creatorId',
  verifyClerkToken,
  isLocalBusiness,
  getContentByCreator
);

// PATCH /api/business/content/:contentId/accept - Accept content
router.patch('/content/:contentId/accept',
  verifyClerkToken,
  isLocalBusiness,
  acceptContent
);

// PATCH /api/business/content/:contentId/reject - Reject content
router.patch('/content/:contentId/reject',
  verifyClerkToken,
  isLocalBusiness,
  rejectContent
);

// GET /api/business/:businessId/milestones - Get milestones (public route)
router.get('/:businessId/milestones', getMilestones);

module.exports = router;
