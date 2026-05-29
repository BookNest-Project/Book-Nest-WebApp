import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

export const analyticsRepository = {
  /**
   * Get sales summary for a user (author or publisher)
   */
  async getSalesSummary(userId, userRole) {
    try {
      // Get user's books
      const { data: books, error: booksError } = await supabaseAdmin
        .from('books')
        .select('id, title, cover_image_url, sales_count, total_revenue')
        .eq('uploaded_by', userId)
        .eq('is_active', true);

      if (booksError) {
        logger.error('Analytics books error', { error: booksError.message });
        return {
          total_books: 0,
          total_copies_sold: 0,
          total_revenue: 0,
          pending_approval: 0,
          books: [],
          error: booksError.message,
        };
      }

      // Count pending approval books
      const { count: pendingCount, error: pendingError } = await supabaseAdmin
        .from('books')
        .select('id', { count: 'exact', head: true })
        .eq('uploaded_by', userId)
        .eq('status', 'pending_review');

      if (pendingError) {
        logger.error('Pending count error', { error: pendingError.message });
      }

      const totalBooks = books?.length || 0;
      const totalCopiesSold = books?.reduce((sum, b) => sum + (b.sales_count || 0), 0) || 0;
      const totalRevenue = books?.reduce((sum, b) => sum + parseFloat(b.total_revenue || 0), 0) || 0;

      // Get sales over time (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // This assumes you have an orders table (will implement in purchase phase)
      // For now, return empty array
      const salesOverTime = [];

      // Get top books
      const topBooks = books
        ?.filter(b => (b.sales_count || 0) > 0)
        .sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))
        .slice(0, 5)
        .map(b => ({
          book_id: b.id,
          title: b.title,
          cover_image_url: b.cover_image_url,
          copies_sold: b.sales_count || 0,
          revenue: parseFloat(b.total_revenue || 0),
        })) || [];

      return {
        total_books: totalBooks,
        total_copies_sold: totalCopiesSold,
        total_revenue: totalRevenue,
        pending_approval: pendingCount || 0,
        books: books || [],
        sales_over_time: salesOverTime,
        top_books: topBooks,
        error: null,
      };
    } catch (error) {
      logger.error('Analytics unexpected error', { error: error.message });
      return {
        total_books: 0,
        total_copies_sold: 0,
        total_revenue: 0,
        pending_approval: 0,
        books: [],
        sales_over_time: [],
        top_books: [],
        error: error.message,
      };
    }
  },
};