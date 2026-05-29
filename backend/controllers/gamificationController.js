import { readingActivityService } from '../services/readingActivityService.js';
import { formatSuccess } from '../utils/responseFormatter.js';

export const gamificationController = {
  async getMe(req, res, next) {
    try {
      const profile = await readingActivityService.getGamificationProfile(req.user.id);
      res.status(200).json(formatSuccess(profile, 'Gamification profile'));
    } catch (error) {
      next(error);
    }
  },
};
