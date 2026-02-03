const cloudinary = require('../config/cloudinary');
const { Readable } = require('stream');

/**
 * Upload image buffer to Cloudinary
 * @param {Buffer} fileBuffer - Image file buffer
 * @param {string} folder - Cloudinary folder path
 * @returns {Promise<Object>} Object with url, public_id, width, height
 */
const uploadImage = async (fileBuffer, folder = 'uploads') => {
  try {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: folder,
          resource_type: 'image',
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary image upload error:', error);
            reject(new Error(`Failed to upload image: ${error.message}`));
          } else {
            resolve({
              url: result.secure_url,
              public_id: result.public_id,
              width: result.width,
              height: result.height
            });
          }
        }
      );

      // Convert buffer to stream
      const bufferStream = new Readable();
      bufferStream.push(fileBuffer);
      bufferStream.push(null);
      
      bufferStream.pipe(uploadStream);
    });
  } catch (error) {
    console.error('Error in uploadImage:', error);
    throw new Error(`Image upload failed: ${error.message}`);
  }
};

/**
 * Upload video buffer to Cloudinary with automatic thumbnail generation
 * @param {Buffer} fileBuffer - Video file buffer
 * @param {string} folder - Cloudinary folder path
 * @returns {Promise<Object>} Object with url, thumbnailUrl, public_id, duration
 */
const uploadVideo = async (fileBuffer, folder = 'uploads') => {
  try {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: folder,
          resource_type: 'video',
          eager: [
            { format: 'jpg', width: 800, height: 600, crop: 'limit' }
          ],
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary video upload error:', error);
            reject(new Error(`Failed to upload video: ${error.message}`));
          } else {
            // Get thumbnail URL from eager transformations
            const thumbnailUrl = result.eager && result.eager.length > 0
              ? result.eager[0].secure_url
              : null;

            resolve({
              url: result.secure_url,
              thumbnailUrl: thumbnailUrl,
              public_id: result.public_id,
              duration: result.duration
            });
          }
        }
      );

      // Convert buffer to stream
      const bufferStream = new Readable();
      bufferStream.push(fileBuffer);
      bufferStream.push(null);
      
      bufferStream.pipe(uploadStream);
    });
  } catch (error) {
    console.error('Error in uploadVideo:', error);
    throw new Error(`Video upload failed: ${error.message}`);
  }
};

/**
 * Delete file from Cloudinary using public_id
 * @param {string} publicId - Cloudinary public_id
 * @returns {Promise<boolean>} Success boolean
 */
const deleteFile = async (publicId) => {
  try {
    if (!publicId) {
      throw new Error('publicId is required');
    }

    const result = await cloudinary.uploader.destroy(publicId);
    
    if (result.result === 'ok' || result.result === 'not found') {
      return true;
    } else {
      console.error('Cloudinary delete error:', result);
      return false;
    }
  } catch (error) {
    console.error('Error in deleteFile:', error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
};

module.exports = {
  uploadImage,
  uploadVideo,
  deleteFile
};
