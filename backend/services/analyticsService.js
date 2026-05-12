import { analyticsRepository } from '../repositories/analyticsRepository.js';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const analyticsService = {
  async getSalesAnalytics(userId, userRole) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    const result = await analyticsRepository.getSalesSummary(userId, userRole);

    if (result.error) {
      throw new Error(result.error);
    }

    logger.info('Sales analytics retrieved', { userId, userRole });

    return {
      summary: {
        total_books: result.total_books,
        total_copies_sold: result.total_copies_sold,
        total_revenue: result.total_revenue,
        pending_approval: result.pending_approval,
      },
      sales_over_time: result.sales_over_time,
      top_books: result.top_books,
    };
  },
};