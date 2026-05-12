import { wishlistService } from '../services/wishlistService.js';
import { validateBookId } from '../validators/bookValidator.js';
import { formatSuccess } from '../utils/responseFormatter.js';
import { logger } from '../utils/logger.js';

export const wishlistController = {
  async addToWishlist(req, res, next) {
    try {
      const userId = req.user.id;
      const { book_id } = req.body;

      validateBookId(book_id);

      const item = await wishlistService.addToWishlist(userId, book_id);

      res.status(201).json(formatSuccess(item, 'Book added to wishlist'));
    } catch (error) {
      next(error);
    }
  },

  async removeFromWishlist(req, res, next) {
    try {
      const userId = req.user.id;
      const { bookId } = req.params;

      validateBookId(bookId);

      await wishlistService.removeFromWishlist(userId, bookId);

      res.status(200).json(formatSuccess(null, 'Book removed from wishlist'));
    } catch (error) {
      next(error);
    }
  },

 async getWishlist(req, res, next) {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const result = await wishlistService.getUserWishlist(userId, page, limit);

    // Ensure pagination is always present
    const responseData = {
      items: result.items || [],
      pagination: result.pagination || {
        page: parseInt(page),
        limit: parseInt(limit),
        total: 0,
        totalPages: 0,
      },
    };

    res.status(200).json(formatSuccess(responseData, 'Wishlist retrieved successfully'));
  } catch (error) {
    next(error);
  }
},

  async isInWishlist(req, res, next) {
    try {
      const userId = req.user.id;
      const { bookId } = req.params;

      validateBookId(bookId);

      const result = await wishlistService.isInWishlist(userId, bookId);

      res.status(200).json(formatSuccess(result, 'Wishlist status retrieved'));
    } catch (error) {
      next(error);
    }
  },

  async getWishlistCount(req, res, next) {
    try {
      const userId = req.user.id;
      const count = await wishlistService.getWishlistCount(userId);

      res.status(200).json(formatSuccess({ count }, 'Wishlist count retrieved'));
    } catch (error) {
      next(error);
    }
  },
};