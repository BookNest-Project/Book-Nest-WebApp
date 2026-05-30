import { analyticsService } from '../services/analyticsService.js';
import { reviewService } from '../services/reviewService.js';
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

      const analytics = await analyticsService.getSalesAnalytics(userId);

      res.status(200).json(formatSuccess(analytics, 'Sales analytics retrieved successfully'));
    } catch (error) {
      next(error);
    }
  },

  async getSalesReport(req, res, next) {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;

      if (userRole !== 'author' && userRole !== 'publisher') {
        return res.status(403).json({
          success: false,
          error: { message: 'Only authors and publishers can view sales reports' },
        });
      }

      const report = await analyticsService.getSalesReport(
        userId,
        req.query.from,
        req.query.to
      );

      res.status(200).json(formatSuccess(report, 'Sales report retrieved'));
    } catch (error) {
      next(error);
    }
  },

  async getBookPerformance(req, res, next) {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;

      if (userRole !== 'author' && userRole !== 'publisher') {
        return res.status(403).json({
          success: false,
          error: { message: 'Only authors and publishers can view book performance' },
        });
      }

      const performance = await analyticsService.getBookPerformance(userId);
      res.status(200).json(formatSuccess(performance, 'Book performance retrieved'));
    } catch (error) {
      next(error);
    }
  },

  async getSellerReviews(req, res, next) {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;

      if (userRole !== 'author' && userRole !== 'publisher') {
        return res.status(403).json({
          success: false,
          error: { message: 'Only authors and publishers can view catalog reviews' },
        });
      }

      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
      const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

      const result = await reviewService.listForSeller(userId, { limit, offset });
      res.status(200).json(formatSuccess(result, 'Catalog reviews retrieved'));
    } catch (error) {
      next(error);
    }
  },
};