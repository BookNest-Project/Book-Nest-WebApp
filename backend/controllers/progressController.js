import { progressService } from '../services/progressService.js';
import { formatSuccess } from '../utils/responseFormatter.js';
import { logger } from '../utils/logger.js';

export const progressController = {
  async syncProgress(req, res, next) {
    try {
      const userId = req.user.id;
      const result = await progressService.syncProgress(userId, req.body);
      res.status(200).json(formatSuccess(result, 'Progress synced'));
    } catch (error) {
      logger.error('Sync progress error', { error: error.message });
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          error: { message: error.message },
        });
      }
      next(error);
    }
  },

  async getAllProgress(req, res, next) {
    try {
      const data = await progressService.getAllProgress(req.user.id);
      res.status(200).json(formatSuccess(data, 'Progress retrieved'));
    } catch (error) {
      next(error);
    }
  },

  async getProgressForFormat(req, res, next) {
    try {
      const data = await progressService.getProgressForFormat(
        req.user.id,
        req.params.bookFormatId
      );
      res.status(200).json(formatSuccess(data, 'Progress retrieved'));
    } catch (error) {
      next(error);
    }
  },
};
