const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const authRoutes = require('./src/routes/auth');
const businessRoutes = require('./src/routes/business');
const creatorRoutes = require('./src/routes/creator');
const adminRoutes = require('./src/routes/admin');
const { getAllCategories } = require('./src/controllers/adminController');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/creator', creatorRoutes);
app.use('/api/admin', adminRoutes);

// Root route
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Rewards App API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      business: '/api/business',
      creator: '/api/creator',
      admin: '/api/admin',
      categories: '/api/categories'
    }
  });
});

// Public routes
app.get('/api/categories', getAllCategories);

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mobileapp';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error.message || error);
    if (error.message && error.message.includes('whitelist')) {
      console.error('→ Add your current IP to MongoDB Atlas Network Access: https://www.mongodb.com/docs/atlas/security-whitelist/');
    }
  });

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
