import { profileService } from '../services/profileService.js';
import { formatSuccess } from '../utils/responseFormatter.js';

export const profileController = {
  async getProfile(req, res, next) {
    try {
      const data = await profileService.formatProfileResponse(req.user.id);
      res.status(200).json(formatSuccess(data, 'Profile retrieved successfully'));
    } catch (error) {
      next(error);
    }
  },

  async updateProfile(req, res, next) {
    try {
      const updated = await profileService.updateProfile(req.user.id, req.body || {});
      res.status(200).json(formatSuccess(updated, 'Profile updated successfully'));
    } catch (error) {
      next(error);
    }
  },

  async uploadAvatar(req, res, next) {
    try {
      if (!req.file) {
        const err = new Error('Profile photo file is required');
        err.statusCode = 400;
        throw err;
      }

      const result = await profileService.uploadAvatar(req.user.id, req.file);
      res.status(200).json(
        formatSuccess(
          {
            avatar_url: result.avatar_url,
            user: result.session?.user ?? null,
          },
          'Profile photo updated successfully',
        ),
      );
    } catch (error) {
      if (
        error.message?.includes('Invalid') ||
        error.message?.includes('too large') ||
        error.message?.includes('required') ||
        error.statusCode === 400
      ) {
        error.statusCode = 400;
      }
      next(error);
    }
  },
};
