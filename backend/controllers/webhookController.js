import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

export const webhookController = {
  async handleChapaWebhook(req, res) {
    try {
      // Parse the body correctly - it's coming as Buffer
      let body;
      if (Buffer.isBuffer(req.body)) {
        const bodyString = req.body.toString('utf8');
        body = JSON.parse(bodyString);
      } else if (typeof req.body === 'string') {
        body = JSON.parse(req.body);
      } else {
        body = req.body;
      }

      logger.info('Webhook received', { 
        event: body.event,
        status: body.status,
        tx_ref: body.tx_ref,
        reference: body.reference 
      });

      const { event, tx_ref, reference, status, amount, currency } = body;

      // Only process charge.success events
      if (event !== 'charge.success') {
        logger.info('Ignoring non-success event', { event });
        return res.status(200).json({ received: true });
      }

      if (!tx_ref || status !== 'success') {
        logger.warn('Invalid webhook data', { tx_ref, status });
        return res.status(200).json({ received: true });
      }

      logger.info('Processing successful payment', { tx_ref, reference, amount });

      // Find transaction by payment_id (tx_ref)
      // Find transaction by payment_id (which stores the full tx_ref)
const { data: transaction, error: findError } = await supabaseAdmin
  .from('transactions')
  .select('id, user_id, book_format_id, status')
  .eq('payment_id', tx_ref)
  .single();
  
      if (findError) {
        logger.error('Transaction find error', { tx_ref, error: findError.message });
        return res.status(200).json({ received: true });
      }

      if (!transaction) {
        logger.error('Transaction not found', { tx_ref });
        return res.status(200).json({ received: true });
      }

      logger.info('Transaction found', { transactionId: transaction.id, currentStatus: transaction.status });

      // Skip if already completed
      if (transaction.status === 'completed') {
        logger.info('Transaction already completed', { transactionId: transaction.id });
        return res.status(200).json({ received: true });
      }

      // Update transaction with both payment_id (Chapa reference) and tx_ref
const { error: updateError } = await supabaseAdmin
  .from('transactions')
  .update({
    status: 'completed',
    payment_id: reference || tx_ref,  // Store Chapa's reference
    completed_at: new Date().toISOString(),
  })
  .eq('id', transaction.id);

      if (updateError) {
        logger.error('Transaction update error', { error: updateError.message });
        return res.status(200).json({ received: true });
      }

      logger.info('Transaction updated', { transactionId: transaction.id });

      // Add to user purchases
      const { error: purchaseError } = await supabaseAdmin
        .from('user_purchases')
        .insert({
          user_id: transaction.user_id,
          book_format_id: transaction.book_format_id,
          transaction_id: transaction.id,
        });

      if (purchaseError) {
        logger.error('Purchase insert error', { error: purchaseError.message });
      } else {
        logger.info('Purchase added', { userId: transaction.user_id, bookFormatId: transaction.book_format_id });
      }

      // Update book sales count
      const { data: bookFormat } = await supabaseAdmin
        .from('book_formats')
        .select('book_id')
        .eq('id', transaction.book_format_id)
        .single();

      if (bookFormat) {
        await supabaseAdmin.rpc('increment_book_sales', {
          book_id: bookFormat.book_id,
          amount: 1,
        });
        logger.info('Book sales incremented', { bookId: bookFormat.book_id });
      }

      // Clear cart item if exists
      const { data: cart } = await supabaseAdmin
        .from('carts')
        .select('id')
        .eq('user_id', transaction.user_id)
        .single();

      if (cart) {
        await supabaseAdmin
          .from('cart_items')
          .delete()
          .eq('cart_id', cart.id)
          .eq('book_format_id', transaction.book_format_id);
        logger.info('Cart item cleared', { cartId: cart.id });
      }

      logger.info('Payment completed via webhook', {
        transactionId: transaction.id,
        userId: transaction.user_id,
      });

      res.status(200).json({ received: true });
    } catch (error) {
      logger.error('Webhook processing error', { error: error.message, stack: error.stack });
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  },
};