const express = require('express');
const router = express.Router();
const { verifyClerkToken } = require('../middleware/clerkAuth');
const { isSuperAdmin } = require('../middleware/roleCheck');
const {
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
} = require('../controllers/adminController');

// Dashboard routes
router.get('/dashboard/stats',
  verifyClerkToken,
  isSuperAdmin,
  getDashboardStats
);

// Category routes
router.get('/categories',
  verifyClerkToken,
  isSuperAdmin,
  getAllCategories
);

router.post('/categories',
  verifyClerkToken,
  isSuperAdmin,
  createCategory
);

router.patch('/categories/:categoryId',
  verifyClerkToken,
  isSuperAdmin,
  updateCategory
);

router.delete('/categories/:categoryId',
  verifyClerkToken,
  isSuperAdmin,
  deleteCategory
);

// Business routes
router.get('/businesses',
  verifyClerkToken,
  isSuperAdmin,
  getAllBusinessesAdmin
);

router.patch('/businesses/:businessId/verify',
  verifyClerkToken,
  isSuperAdmin,
  verifyBusiness
);

router.patch('/businesses/:businessId/suspend',
  verifyClerkToken,
  isSuperAdmin,
  suspendBusiness
);

router.patch('/businesses/:businessId/unsuspend',
  verifyClerkToken,
  isSuperAdmin,
  unsuspendBusiness
);

router.delete('/businesses/:businessId',
  verifyClerkToken,
  isSuperAdmin,
  deleteBusiness
);

// Creator routes
router.get('/creators',
  verifyClerkToken,
  isSuperAdmin,
  getAllCreatorsAdmin
);

router.get('/creators/:creatorId',
  verifyClerkToken,
  isSuperAdmin,
  getCreatorDetails
);

router.patch('/creators/:creatorId/suspend',
  verifyClerkToken,
  isSuperAdmin,
  suspendCreator
);

router.patch('/creators/:creatorId/unsuspend',
  verifyClerkToken,
  isSuperAdmin,
  unsuspendCreator
);

// Content routes
router.get('/content',
  verifyClerkToken,
  isSuperAdmin,
  getAllContentAdmin
);

// Report routes
router.get('/reports',
  verifyClerkToken,
  isSuperAdmin,
  generateReport
);

module.exports = router;
