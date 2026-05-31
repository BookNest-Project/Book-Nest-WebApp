// backend/controllers/userController.js
import { userService } from '../services/userService.js';
import { userRepository } from '../repositories/userRepository.js';
import { formatSuccess } from '../utils/responseFormatter.js';

export const userController = {
  async getProfile(req, res, next) {
    try {
      const profile = await userService.getUserProfile(req.user.id);
      res.status(200).json(formatSuccess(profile));
    } catch (error) {
      next(error);
    }
  },

  async updateProfile(req, res, next) {
    try {
      const updatedProfile = await userService.updateProfile(req.user.id, req.body);
      res.status(200).json(formatSuccess(updatedProfile, 'Profile updated successfully'));
    } catch (error) {
      next(error);
    }
  },

  async saveFavoriteGenres(req, res, next) {
    try {
      const { genre_ids } = req.body;
      const genres = await userService.saveFavoriteGenres(req.user.id, genre_ids);
      res.status(200).json({
        success: true,
        data: { genre_ids: genres },
        message: 'Favorite genres saved successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  async getFavoriteGenres(req, res, next) {
    try {
      const genres = await userService.getFavoriteGenres(req.user.id);
      res.status(200).json({
        success: true,
        data: genres,
        message: 'Favorite genres retrieved',
      });
    } catch (error) {
      next(error);
    }
  },

  async searchUsers(req, res, next) {
    try {
      const { q, role, community } = req.query;
      const users =
        community === 'true' || community === '1'
          ? await userService.searchCommunityUsers(q, req.user.id)
          : await userService.searchUsers(q, req.user.id, role);
      res.status(200).json({ success: true, data: users });
    } catch (error) {
      next(error);
    }
  },

  async updatePresence(req, res, next) {
    try {
      const lastSeenAt = await userRepository.updateLastSeen(req.user.id);
      res.status(200).json({
        success: true,
        data: { lastSeenAt },
        message: 'Presence updated',
      });
    } catch (error) {
      next(error);
    }
  },
};