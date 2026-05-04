import { wishlistRepository } from '../repositories/wishlistRepository.js';
import { bookRepository } from '../repositories/bookRepository.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const wishlistService = {
  async addToWishlist(userId, bookId) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }
    if (!bookId) {
      throw new ValidationError('Book ID is required');
    }

    // Check if book exists
    const { book, error: bookError } = await bookRepository.findById(bookId, userId);
    if (bookError || !book) {
      throw new NotFoundError('Book');
    }

    const { item, error } = await wishlistRepository.addItem(userId, bookId);
    if (error) {
      throw new ValidationError(error);
    }

    logger.info('Book added to wishlist', { userId, bookId });
    return item;
  },

  async removeFromWishlist(userId, bookId) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }
    if (!bookId) {
      throw new ValidationError('Book ID is required');
    }

    const { error } = await wishlistRepository.removeItem(userId, bookId);
    if (error) {
      throw new ValidationError(error);
    }

    logger.info('Book removed from wishlist', { userId, bookId });
    return true;
  },

 async getUserWishlist(userId, page = 1, limit = 20) {
  if (!userId) {
    throw new ValidationError('User ID is required');
  }

  const validatedPage = Math.max(1, parseInt(page) || 1);
  const validatedLimit = Math.min(50, Math.max(1, parseInt(limit) || 20));

  const { items, total, pagination, error } = await wishlistRepository.getUserWishlist(
    userId,
    validatedPage,
    validatedLimit
  );

  if (error) {
    throw new Error(error);
  }

  return {
    items,
    pagination: pagination || {
      page: validatedPage,
      limit: validatedLimit,
      total: total || 0,
      totalPages: Math.ceil((total || 0) / validatedLimit),
    },
  };
},

  async isInWishlist(userId, bookId) {
    if (!userId || !bookId) {
      return { isInWishlist: false };
    }

    const { isInWishlist, error } = await wishlistRepository.isInWishlist(userId, bookId);
    return { isInWishlist: !error && isInWishlist };
  },

  async getWishlistCount(userId) {
    if (!userId) {
      return 0;
    }

    const { count, error } = await wishlistRepository.getWishlistCount(userId);
    return error ? 0 : count;
  },
};