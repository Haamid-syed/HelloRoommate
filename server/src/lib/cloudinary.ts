import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';
import { logger } from './logger.js';

// Configure Cloudinary only if credentials are provided
if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  logger.info('☁️ Cloudinary SDK configured successfully');
} else {
  logger.warn('☁️ Cloudinary credentials not configured — image upload will fail');
}

/**
 * Upload an image buffer directly to Cloudinary using upload_stream.
 * Returns the secure URL of the uploaded image.
 */
export function uploadToCloudinary(fileBuffer: Buffer, folder = 'roomfinder'): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
      reject(new Error('Cloudinary is not configured on this server'));
      return;
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 1000, height: 600, crop: 'limit' }],
      },
      (error, result) => {
        if (error) {
          logger.error({ error }, 'Cloudinary buffer upload failed');
          reject(error);
        } else if (result) {
          resolve(result.secure_url);
        } else {
          reject(new Error('Empty result from Cloudinary upload'));
        }
      }
    );

    uploadStream.end(fileBuffer);
  });
}
