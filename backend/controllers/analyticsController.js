import { analyticsService } from '../services/analyticsService.js';
import { formatSuccess } from '../utils/responseFormatter.js';
import { logger } from '../utils/logger.js';

export const analyticsController = {
  /**
   * Get sales analytics for current user
   * GET /api/analytics/sales
   */
  async getSalesAnalytics(req, res, next) {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;

      // ✅ Allow both authors and publishers
      if (userRole !== 'author' && userRole !== 'publisher') {
        return res.status(403).json({
          success: false,
          error: { message: 'Only authors and publishers can view sales analytics' },
        });
      }

      const analytics = await analyticsService.getSalesAnalytics(userId, userRole);

      res.status(200).json(formatSuccess(analytics, 'Sales analytics retrieved successfully'));
    } catch (error) {
      next(error);
    }
  },
};