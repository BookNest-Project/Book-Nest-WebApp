import { checkoutService } from '../services/checkoutService.js';
import { supabaseAdmin } from '../config/supabase.js';
import { formatSuccess } from '../utils/responseFormatter.js';
import { logger } from '../utils/logger.js';

export const checkoutController = {
  /**
   * Initialize checkout - single format or full cart (one Chapa payment)
   * POST /api/checkout
   * Body: { book_format_id } | { book_format_ids: string[] } | { from_cart: true }
   */
  async initializeCheckout(req, res, next) {
    try {
      const userId = req.user.id;
      const user = req.user;
      const { book_format_id, book_format_ids, from_cart } = req.body;

      let result;

      if (from_cart) {
        result = await checkoutService.initializeCartCheckout(userId, user);
      } else if (Array.isArray(book_format_ids) && book_format_ids.length > 0) {
        result = await checkoutService.initializeFormatsCheckout(userId, user, book_format_ids);
      } else if (book_format_id) {
        result = await checkoutService.initializeSingleCheckout(userId, user, book_format_id);
      } else {
        return res.status(400).json({
          success: false,
          error: { message: 'book_format_id, book_format_ids, or from_cart is required' },
        });
      }

      res.status(200).json(formatSuccess(result, 'Checkout initialized successfully'));
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          error: { message: error.message },
        });
      }
      next(error);
    }
  },

  /**
   * Verify payment with Chapa and fulfill purchases (webhook fallback).
   * GET /api/checkout/verify?tx_ref=xxx
   */
  async verifyPayment(req, res, next) {
    try {
      const tx_ref = req.query.tx_ref || req.query.trx_ref || req.query.trxref;

      if (!tx_ref) {
        return res.status(400).json({ success: false, error: { message: 'tx_ref required' } });
      }

      const result = await checkoutService.verifyAndFulfillPayment(
        String(tx_ref),
        req.user.id
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Verify error', { error: error.message });
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  },

  async debug(req, res) {
    const { data: transactions } = await supabaseAdmin
      .from('transactions')
      .select('id, transaction_number, payment_id, status')
      .order('created_at', { ascending: false })
      .limit(10);

    res.json({ transactions });
  },
};
