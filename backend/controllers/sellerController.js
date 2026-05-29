import { bookService } from '../services/bookService.js';
import { userRepository } from '../repositories/userRepository.js';
import { formatSuccess } from '../utils/responseFormatter.js';
import { logger } from '../utils/logger.js';

export const sellerController = {
  /**
   * Get seller profile by user ID (author or publisher)
   * GET /api/seller/:userId
   */
  async getSellerProfile(req, res, next) {
    try {
      const { userId } = req.params;
      const currentUserId = req.user?.id;

      // Get user info
      const user = await userRepository.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: { message: 'User not found' },
        });
      }

      // Only authors and publishers have seller profiles
      if (user.role !== 'author' && user.role !== 'publisher') {
        return res.status(400).json({
          success: false,
          error: { message: 'This user does not have a seller profile' },
        });
      }

      // Get profile based on role
      let profile = null;
      if (user.role === 'author') {
        profile = await userRepository.findAuthorProfile(userId);
      } else if (user.role === 'publisher') {
        profile = await userRepository.findPublisherProfile(userId);
      }

      // Get user's approved books
      const { books } = await bookService.getBooks({
        genreId: null,
        format: null,
        search: null,
        page: 1,
        limit: 100,
        userId: currentUserId,
      });

      // Filter books by this seller
      const sellerBooks = books.filter(book => book.uploaded_by === userId);

      // Calculate totals
      const totalSales = sellerBooks.reduce((sum, b) => sum + (b.sales_count || 0), 0);
      const totalRevenue = sellerBooks.reduce((sum, b) => sum + (b.total_revenue || 0), 0);

      const sellerData = {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          account_status: user.account_status,
        },
        profile: profile ? {
          ...(user.role === 'author' && {
            pen_name: profile.pen_name,
            full_name: profile.full_name,
          }),
          ...(user.role === 'publisher' && {
            company_name: profile.company_name,
          }),
          avatar_url: profile?.avatar_url,
          bio: profile?.bio,
          website_url: profile?.website_url,
          created_at: profile?.created_at,
        } : null,
        books: sellerBooks.map(book => ({
          id: book.id,
          title: book.title,
          cover_image_url: book.cover_image_url,
          formats: book.formats,
          sales_count: book.sales_count || 0,
        })),
        total_books: sellerBooks.length,
        total_sales: totalSales,
        total_revenue: totalRevenue,
      };

      logger.info('Seller profile retrieved', { sellerId: userId, currentUserId });

      res.status(200).json(formatSuccess(sellerData, 'Seller profile retrieved successfully'));
    } catch (error) {
      next(error);
    }
  },
};