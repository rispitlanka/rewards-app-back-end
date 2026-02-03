const multer = require('multer');

// Configure multer to use memory storage (we'll upload to Cloudinary from buffer)
const storage = multer.memoryStorage();

// File type constants
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo']; // mp4, mov, avi
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];

// File size limits (in bytes)
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILE_SIZE = MAX_VIDEO_SIZE; // Use max for multer config, validate in filter

/**
 * File filter function to validate file type and size
 */
const fileFilter = (req, file, cb) => {
  // Check file type
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    const allowedExtensions = [
      ...ALLOWED_IMAGE_TYPES.map(t => t.split('/')[1]),
      ...ALLOWED_VIDEO_TYPES.map(t => t.split('/')[1])
    ].join(', ');
    
    return cb(new Error(
      `Invalid file type. Allowed types: ${allowedExtensions}`
    ), false);
  }

  // Check file size based on type
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    // For images, we'll check size after upload in the middleware
    // Multer will handle the initial size check
  } else if (ALLOWED_VIDEO_TYPES.includes(file.mimetype)) {
    // For videos, we'll check size after upload in the middleware
    // Multer will handle the initial size check
  }

  cb(null, true);
};

// Base multer configuration
const multerConfig = {
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter: fileFilter
};

/**
 * Middleware to check file size after multer processing
 * This allows us to have different limits for images vs videos
 */
const checkFileSize = (req, res, next) => {
  if (!req.file) {
    return next();
  }

  const file = req.file;
  const isImage = ALLOWED_IMAGE_TYPES.includes(file.mimetype);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.mimetype);

  if (isImage && file.size > MAX_IMAGE_SIZE) {
    return res.status(400).json({
      error: 'File too large',
      message: `Image size exceeds 5MB limit. Current size: ${(file.size / 1024 / 1024).toFixed(2)}MB`
    });
  }

  if (isVideo && file.size > MAX_VIDEO_SIZE) {
    return res.status(400).json({
      error: 'File too large',
      message: `Video size exceeds 50MB limit. Current size: ${(file.size / 1024 / 1024).toFixed(2)}MB`
    });
  }

  next();
};

/**
 * Middleware to check file sizes for multiple files
 */
const checkMultipleFileSizes = (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return next();
  }

  for (const file of req.files) {
    const isImage = ALLOWED_IMAGE_TYPES.includes(file.mimetype);
    const isVideo = ALLOWED_VIDEO_TYPES.includes(file.mimetype);

    if (isImage && file.size > MAX_IMAGE_SIZE) {
      return res.status(400).json({
        error: 'File too large',
        message: `Image "${file.originalname}" exceeds 5MB limit. Current size: ${(file.size / 1024 / 1024).toFixed(2)}MB`
      });
    }

    if (isVideo && file.size > MAX_VIDEO_SIZE) {
      return res.status(400).json({
        error: 'File too large',
        message: `Video "${file.originalname}" exceeds 50MB limit. Current size: ${(file.size / 1024 / 1024).toFixed(2)}MB`
      });
    }
  }

  next();
};

/**
 * Middleware for single file upload
 * @param {string} fieldName - Name of the form field containing the file
 * @returns {Array} Array of middleware functions
 */
const uploadSingle = (fieldName) => {
  const upload = multer(multerConfig).single(fieldName);
  
  return [
    upload,
    checkFileSize,
    (err, req, res, next) => {
      // Handle multer errors
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            error: 'File too large',
            message: 'File size exceeds the maximum allowed limit.'
          });
        }
        return res.status(400).json({
          error: 'Upload error',
          message: err.message
        });
      }
      
      // Handle other errors (like file type validation)
      if (err) {
        return res.status(400).json({
          error: 'Upload error',
          message: err.message
        });
      }
      
      next();
    }
  ];
};

/**
 * Middleware for multiple file uploads
 * @param {string} fieldName - Name of the form field containing the files
 * @param {number} maxCount - Maximum number of files allowed
 * @returns {Array} Array of middleware functions
 */
const uploadMultiple = (fieldName, maxCount = 10) => {
  const upload = multer(multerConfig).array(fieldName, maxCount);
  
  return [
    upload,
    checkMultipleFileSizes,
    (err, req, res, next) => {
      // Handle multer errors
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            error: 'File too large',
            message: 'One or more files exceed the maximum allowed limit.'
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            error: 'Too many files',
            message: `Maximum ${maxCount} files allowed.`
          });
        }
        return res.status(400).json({
          error: 'Upload error',
          message: err.message
        });
      }
      
      // Handle other errors (like file type validation)
      if (err) {
        return res.status(400).json({
          error: 'Upload error',
          message: err.message
        });
      }
      
      next();
    }
  ];
};

module.exports = {
  uploadSingle,
  uploadMultiple
};
