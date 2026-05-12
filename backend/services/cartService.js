import { cartRepository } from '../repositories/cartRepository.js';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const cartService = {
  async getCart(userId) {
    if (!userId) throw new ValidationError('User ID is required');
    const { cart, error } = await cartRepository.getOrCreateCart(userId);
    if (error) throw new Error(error);
    return cart;
  },

  async addToCart(userId, bookFormatId) {
    if (!userId) throw new ValidationError('User ID is required');
    if (!bookFormatId) throw new ValidationError('Book format ID is required');

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