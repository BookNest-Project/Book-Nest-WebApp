import { cartService } from '../services/cartService.js';
import { formatSuccess } from '../utils/responseFormatter.js';
import { logger } from '../utils/logger.js';

export const cartController = {
  async getCart(req, res, next) {
    try {
      const userId = req.user.id;
      const cart = await cartService.getCart(userId);
      res.status(200).json(formatSuccess(cart, 'Cart retrieved successfully'));
    } catch (error) {
      next(error);
    }
  },

  async addToCart(req, res, next) {
    try {
      const userId = req.user.id;
      const { book_format_id } = req.body;

      if (!book_format_id) {
        return res.status(400).json({
          success: false,
          error: { message: 'book_format_id is required' },
        });
      }

      const cart = await cartService.addToCart(userId, book_format_id);
      res.status(200).json(formatSuccess(cart, 'Item added to cart'));
    } catch (error) {
      next(error);
    }
  },

  async updateCartItem(req, res, next) {
    try {
      const userId = req.user.id;
      const { itemId } = req.params;
      const { quantity } = req.body;

      const cart = await cartService.updateCartItem(userId, itemId, quantity);
      res.status(200).json(formatSuccess(cart, 'Cart updated successfully'));
    } catch (error) {
      next(error);
    }
  },

  async removeFromCart(req, res, next) {
    try {
      const userId = req.user.id;
      const { itemId } = req.params;
      const cart = await cartService.removeFromCart(userId, itemId);
      res.status(200).json(formatSuccess(cart, 'Item removed from cart'));
    } catch (error) {
      next(error);
    }
  },

  async clearCart(req, res, next) {
    try {
      const userId = req.user.id;
      const cart = await cartService.clearCart(userId);
      res.status(200).json(formatSuccess(cart, 'Cart cleared successfully'));
    } catch (error) {
      next(error);
    }
  },
};