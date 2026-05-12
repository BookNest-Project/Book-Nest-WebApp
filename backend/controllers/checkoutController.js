import { cartService } from '../services/cartService.js';
import { chapaService } from '../services/chapaService.js';
import { supabaseAdmin } from '../config/supabase.js';
import { formatSuccess } from '../utils/responseFormatter.js';
import { logger } from '../utils/logger.js';

export const checkoutController = {
  /**
   * Initialize checkout - creates transaction and returns Chapa URL
   * POST /api/checkout
   */
  async initializeCheckout(req, res, next) {
    try {
      const userId = req.user.id;
      const user = req.user;
      const { book_format_id } = req.body;

      if (!book_format_id) {
        return res.status(400).json({
          success: false,
          error: { message: 'book_format_id is required' },
        });
      }

      // Get book format details
      const { data: bookFormat, error: formatError } = await supabaseAdmin
        .from('book_formats')
        .select(`
          id,
          price,
          currency,
          book:books!inner (
            id,
            title,
            author_name
          )
        `)
        .eq('id', book_format_id)
        .single();

      if (formatError || !bookFormat) {
        return res.status(404).json({
          success: false,
          error: { message: 'Book format not found' },
        });
      }

      // Generate transaction number
      const transactionNumber = `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      // Create transaction record WITHOUT payment_id first
      const { data: transaction, error: txError } = await supabaseAdmin
        .from('transactions')
        .insert({
          user_id: userId,
          transaction_number: transactionNumber,
          // payment_id will be added after Chapa returns it
          book_format_id: book_format_id,
          amount: bookFormat.price,
          currency: bookFormat.currency || 'ETB',
          status: 'pending',
        })
        .select()
        .single();

      if (txError) throw txError;

      // Initialize Chapa payment (this creates tx_ref)
      const { checkoutUrl, tx_ref, error } = await chapaService.initializePayment(
        transaction,
        user,
        `${process.env.FRONTEND_URL}/checkout/result`
      );

      if (error) throw new Error(error);

      // NOW update transaction with the payment_id (tx_ref from Chapa)
      const { error: updateError } = await supabaseAdmin
        .from('transactions')
        .update({ payment_id: tx_ref })
        .eq('id', transaction.id);

      if (updateError) {
        logger.error('Failed to update payment_id', { error: updateError });
      }

      logger.info('Checkout initialized', { 
        userId, 
        transactionId: transaction.id, 
        tx_ref 
      });

      res.status(200).json(formatSuccess({
        transaction_id: transaction.id,
        transaction_number: transactionNumber,
        checkout_url: checkoutUrl,
        amount: bookFormat.price,
      }, 'Checkout initialized successfully'));
    } catch (error) {
      next(error);
    }
  },

  /**
   * Verify payment manually (fallback if webhook fails or polling)
   * GET /api/checkout/verify?tx_ref=xxx
   */
  async verifyPayment(req, res, next) {
    try {
      const { tx_ref } = req.query;

      console.log('Verify payment called with tx_ref:', tx_ref);

      if (!tx_ref) {
        return res.status(400).json({ success: false, error: { message: 'tx_ref required' } });
      }

      // Search by payment_id (which stores the full tx_ref from Chapa)
      const { data: transaction, error } = await supabaseAdmin
        .from('transactions')
        .select('id, status')
        .eq('payment_id', tx_ref)
        .single();

      console.log('Transaction found:', transaction);

      if (error || !transaction) {
        return res.status(200).json({ success: true, data: { verified: false } });
      }

      const verified = transaction.status === 'completed';
      console.log('Verified:', verified);

      res.status(200).json({ 
        success: true, 
        data: { verified, already_processed: verified } 
      });
    } catch (error) {
      console.error('Verify error:', error);
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
}
};