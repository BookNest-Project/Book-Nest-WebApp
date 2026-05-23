import { followRepository } from '../repositories/followRepository.js';
import { formatSuccess } from '../utils/responseFormatter.js';
import { logger } from '../utils/logger.js';

export const followController = {
  async follow(req, res, next) {
    try {
      const followerId = req.user.id;
      const { userId } = req.params;

      await followRepository.follow(followerId, userId);

      res.status(200).json(formatSuccess(null, 'Followed successfully'));
    } catch (error) {
      next(error);
    }
  },

  async unfollow(req, res, next) {
    try {
      const followerId = req.user.id;
      const { userId } = req.params;

      await followRepository.unfollow(followerId, userId);

      res.status(200).json(formatSuccess(null, 'Unfollowed successfully'));
    } catch (error) {
      next(error);
    }
  },

  async isFollowing(req, res, next) {
    try {
      const followerId = req.user.id;
      const { userId } = req.params;

      const isFollowing = await followRepository.isFollowing(followerId, userId);

      res.status(200).json(formatSuccess({ isFollowing }, 'Follow status retrieved'));
    } catch (error) {
      next(error);
    }
  },

  async getFollowers(req, res, next) {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 20 } = req.query;

      const result = await followRepository.getFollowers(userId, parseInt(page), parseInt(limit));

      res.status(200).json(formatSuccess(result, 'Followers retrieved'));
    } catch (error) {
      next(error);
    }
  },

  async getFollowing(req, res, next) {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 20 } = req.query;

      const result = await followRepository.getFollowing(userId, parseInt(page), parseInt(limit));

      res.status(200).json(formatSuccess(result, 'Following retrieved'));
    } catch (error) {
      next(error);
    }
  },
};