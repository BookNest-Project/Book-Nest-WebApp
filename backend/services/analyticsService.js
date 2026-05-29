import { analyticsRepository } from '../repositories/analyticsRepository.js';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const analyticsService = {
  async getSalesAnalytics(userId) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    const result = await analyticsRepository.getSalesSummary(userId);

    logger.info('Sales analytics retrieved', { userId });

    return {
      summary: {
        total_books: result.total_books,
        total_copies_sold: result.total_copies_sold,
        total_revenue: result.total_revenue,
        pending_approval: result.pending_approval,
      },
      sales_over_time: result.sales_over_time,
      top_books: result.top_books,
      wallet: result.wallet,
    };
  },

  async getSalesReport(userId, from, to) {
    return analyticsRepository.getSalesReport(userId, from, to);
  },
};
