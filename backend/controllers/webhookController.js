import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

export const webhookController = {
  async handleChapaWebhook(req, res) {
    try {
      // Get the raw body and signature from headers
      const rawBody = req.body.toString();
      const signature = req.headers['x-chapa-signature'] || req.headers['chapa-signature'];
      
      // Log webhook receipt
      logger.info('Webhook received', { 
        signature: signature ? 'present' : 'missing',
        bodyLength: rawBody.length
      });

      // Verify webhook signature (skip if no secret configured, but warn)
      const webhookSecret = process.env.CHAPA_WEBHOOK_SECRET;
      
      if (webhookSecret && signature) {
        const expectedSignature = crypto
          .createHmac('sha256', webhookSecret)
          .update(rawBody)
          .digest('hex');

        if (signature !== expectedSignature) {
          logger.error('Invalid webhook signature', { signature, expectedSignature });
          return res.status(401).json({ error: 'Invalid signature' });
        }
        logger.info('Webhook signature verified');
      } else if (!webhookSecret) {
        logger.warn('CHAPA_WEBHOOK_SECRET not set, skipping signature verification');
      } else if (!signature) {
        logger.warn('No signature provided in webhook headers');
      }

      // Parse the body
      let body;
      try {
        body = JSON.parse(rawBody);
      } catch (parseError) {
        logger.error('Failed to parse webhook body', { error: parseError.message });
        return res.status(400).json({ error: 'Invalid JSON body' });
      }

      logger.info('Webhook parsed', { 
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

      // Update transaction
      const { error: updateError } = await supabaseAdmin
        .from('transactions')
        .update({
          status: 'completed',
          payment_id: reference || tx_ref,
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