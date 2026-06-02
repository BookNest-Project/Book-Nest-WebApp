import { profileRepository } from '../repositories/profileRepository.js';
import { fileUploadService } from '../services/fileUploadService.js';
import { formatSuccess } from '../utils/responseFormatter.js';
import { logger } from '../utils/logger.js';
import { ValidationError } from '../utils/errors.js';

export const profileController = {
  async getProfile(req, res, next) {
    try {
      const userId = req.user.id;
      const profile = await profileRepository.getProfile(userId);
      res.status(200).json(formatSuccess(profile, 'Profile retrieved'));
    } catch (error) {
      next(error);
    }
  },

  async updateProfile(req, res, next) {
    try {
      const userId = req.user.id;
      const { display_name, pen_name, company_name, full_name, bio, location, website_url } =
        req.body;

      const updates = {
        bio,
        location,
        website_url,
        display_name,
        pen_name,
        company_name,
        full_name,
      };

      const result = await profileRepository.updateProfile(userId, updates);
      if (result?.error) {
        throw new ValidationError(result.error);
      }

      res.status(200).json(formatSuccess(null, 'Profile updated successfully'));
    } catch (error) {
      next(error);
    }
  },

  async updateAvatar(req, res, next) {
    try {
      const userId = req.user.id;
      
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { url } = await fileUploadService.uploadAvatar(req.file, userId);
      const existing = await profileRepository.getProfile(userId);
      if (existing?.avatar_url) {
        try {
          const marker = '/booknest/';
          const idx = existing.avatar_url.indexOf(marker);
          if (idx >= 0) {
            await fileUploadService.deleteFile(existing.avatar_url.slice(idx + marker.length));
          }
        } catch {
          /* ignore old avatar cleanup */
        }
      }
      const result = await profileRepository.updateAvatar(userId, url);
      if (result?.error) {
        throw new Error(result.error);
      }

      res.status(200).json(formatSuccess({ avatar_url: url }, 'Avatar updated'));
    } catch (error) {
      next(error);
    }
  },

  async updateSettings(req, res, next) {
    try {
      const userId = req.user.id;
      const { is_public, show_email, show_reading_stats, email_notifications, push_notifications, marketing_emails } = req.body;

      const result = await profileRepository.updateSettings(userId, {
        is_public,
        show_email,
        show_reading_stats,
        email_notifications,
        push_notifications,
        marketing_emails,
      });
      if (result?.error) {
        throw new Error(result.error);
      }

      res.status(200).json(formatSuccess(null, 'Settings updated'));
    } catch (error) {
      next(error);
    }
  },

  async getProfilePhotos(req, res, next) {
    try {
      const photos = await profileRepository.getProfilePhotos(req.user.id);
      res.status(200).json(formatSuccess(photos, 'Profile photos retrieved'));
    } catch (error) {
      next(error);
    }
  },

  async addProfilePhoto(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      const { url } = await fileUploadService.uploadProfilePhoto(req.file, req.user.id);
      const photo = await profileRepository.addProfilePhoto(req.user.id, url);
      res.status(201).json(formatSuccess(photo, 'Photo added'));
    } catch (error) {
      next(error);
    }
  },

  async deleteProfilePhoto(req, res, next) {
    try {
      const { photoId } = req.params;
      const row = await profileRepository.deleteProfilePhoto(req.user.id, photoId);
      try {
        const marker = '/booknest/';
        const idx = row.image_url.indexOf(marker);
        if (idx >= 0) {
          await fileUploadService.deleteFile(row.image_url.slice(idx + marker.length));
        }
      } catch {
        /* ignore storage cleanup */
      }
      res.status(200).json(formatSuccess(null, 'Photo deleted'));
    } catch (error) {
      next(error);
    }
  },

 async getPublicProfile(req, res, next) {
  try {
    const { username } = req.params;
    const currentUserId = req.user?.id;
    
    const profile = await profileRepository.getPublicProfile(username, currentUserId);
    res.status(200).json(formatSuccess(profile, 'Profile retrieved'));
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ success: false, error: { message: error.message } });
    }
    next(error);
  }
},

  async deleteAccount(req, res, next) {
    try {
      const userId = req.user.id;
      await profileRepository.deleteAccount(userId);
      res.clearCookie('token', { path: '/' });
      res.status(200).json(formatSuccess({ deleted: true }, 'Account deleted'));
    } catch (error) {
      next(error);
    }
  },
};