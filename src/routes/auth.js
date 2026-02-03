const express = require('express');
const router = express.Router();
const { verifyClerkToken } = require('../middleware/clerkAuth');
const { syncUser, getCurrentUser, updateProfile } = require('../controllers/authController');

// POST /api/auth/sync - Public route (called during Clerk signup)
router.post('/sync', syncUser);

// GET /api/auth/me - Protected route
router.get('/me', verifyClerkToken, getCurrentUser);

// PATCH /api/auth/profile - Protected route
router.patch('/profile', verifyClerkToken, updateProfile);

module.exports = router;
