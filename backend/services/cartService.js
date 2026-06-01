import { cartRepository } from '../repositories/cartRepository.js';
import { ValidationError, ConflictError, ForbiddenError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { assertCanPurchaseFormats, getOwnedFormatIds } from '../utils/purchaseValidation.js';

export const cartService = {
  async getCart(userId) {
    if (!userId) throw new ValidationError('User ID is required');
    const { cart, error } = await cartRepository.getOrCreateCart(userId);
    if (error) throw new Error(error);

    const items = cart?.items || [];
    if (!items.length) return cart;

    const formatIds = items.map((item) => item.book_format_id).filter(Boolean);
    const owned = await getOwnedFormatIds(userId, formatIds);
    if (!owned.size) return cart;

    const toRemove = items.filter((item) => owned.has(item.book_format_id));
    for (const item of toRemove) {
      await cartRepository.removeItem(item.id);
    }

    if (toRemove.length) {
      logger.info('Removed owned formats from cart', { userId, count: toRemove.length });
      const refreshed = await cartRepository.getOrCreateCart(userId);
      if (refreshed.error) throw new Error(refreshed.error);
      return refreshed.cart;
    }

    return cart;
  },

  async addToCart(userId, bookFormatId) {
    if (!userId) throw new ValidationError('User ID is required');
    if (!bookFormatId) throw new ValidationError('Book format ID is required');

    try {
      await assertCanPurchaseFormats(userId, [bookFormatId]);
    } catch (error) {
      if (error.statusCode === 403) {
        throw new ForbiddenError(error.message);
      }
      if (error.statusCode === 409) {
        throw new ConflictError(error.message);
      }
      throw error;
    }

    const { cart, error: cartError } = await cartRepository.getOrCreateCart(userId);
    if (cartError) throw new Error(cartError);

    const { error } = await cartRepository.addItem(cart.id, bookFormatId);
    if (error) throw new Error(error);

    logger.info('Item added to cart', { userId, bookFormatId });
    return await cartService.getCart(userId);
  },

  async removeFromCart(userId, itemId) {
    if (!userId) throw new ValidationError('User ID is required');
    if (!itemId) throw new ValidationError('Item ID is required');

    const { error } = await cartRepository.removeItem(itemId);
    if (error) throw new Error(error);

    logger.info('Item removed from cart', { userId, itemId });
    return await cartService.getCart(userId);
  },

  async clearCart(userId) {
    if (!userId) throw new ValidationError('User ID is required');

    const { cart, error: cartError } = await cartRepository.getOrCreateCart(userId);
    if (cartError) throw new Error(cartError);

    const { error } = await cartRepository.clearCart(cart.id);
    if (error) throw new Error(error);

    logger.info('Cart cleared', { userId });
    return await cartService.getCart(userId);
  },
};