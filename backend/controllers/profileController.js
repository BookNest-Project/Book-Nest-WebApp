import { profileRepository } from '../repositories/profileRepository.js';
import { fileUploadService } from '../services/fileUploadService.js';
import { formatSuccess } from '../utils/responseFormatter.js';
import { logger } from '../utils/logger.js';

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
      const { display_name, pen_name, company_name, bio, location, website_url } = req.body;

      const updates = {
        bio,
        location,
        website_url,
        display_name,
        pen_name,
        company_name,
      };

      await profileRepository.updateProfile(userId, updates);

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

      const { url } = await fileUploadService.uploadCoverImage(req.file, userId);
      await profileRepository.updateAvatar(userId, url);

      res.status(200).json(formatSuccess({ avatar_url: url }, 'Avatar updated'));
    } catch (error) {
      next(error);
    }
  },

  async updateSettings(req, res, next) {
    try {
      const userId = req.user.id;
      const { is_public, show_email, show_reading_stats, email_notifications, push_notifications, marketing_emails } = req.body;

      await profileRepository.updateSettings(userId, {
        is_public,
        show_email,
        show_reading_stats,
        email_notifications,
        push_notifications,
        marketing_emails,
      });

      res.status(200).json(formatSuccess(null, 'Settings updated'));
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
    next(error);
  }
},
};