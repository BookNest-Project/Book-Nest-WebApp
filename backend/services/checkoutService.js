import { supabaseAdmin } from '../config/supabase.js';
import { cartService } from './cartService.js';
import { chapaService } from './chapaService.js';
import { logger } from '../utils/logger.js';
import { assertCanPurchaseFormats } from '../utils/purchaseValidation.js';

function generateTransactionNumber() {
  return `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

async function getBookFormat(bookFormatId) {
  const { data: bookFormat, error } = await supabaseAdmin
    .from('book_formats')
    .select(`
      id,
      price,
      currency,
      is_active,
      format_type,
      book:books!inner (
        id,
        title,
        author_name,
        cover_image_url,
        status
      )
    `)
    .eq('id', bookFormatId)
    .single();

  if (error || !bookFormat) {
    return { bookFormat: null, error: 'Book format not found' };
  }

  if (bookFormat.book?.status !== 'approved' || bookFormat.is_active === false) {
    return { bookFormat: null, error: 'This format is not available for purchase' };
  }

  return { bookFormat, error: null };
}

async function getOwnedFormatIds(userId, formatIds) {
  if (!formatIds.length) return new Set();

  const { data, error } = await supabaseAdmin
    .from('user_purchases')
    .select('book_format_id')
    .eq('user_id', userId)
    .in('book_format_id', formatIds);

  if (error) throw error;
  return new Set((data || []).map((row) => row.book_format_id));
}

async function createTransactionWithItems(userId, lineItems) {
  const totalAmount = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const currency = lineItems[0]?.currency || 'ETB';
  const transactionNumber = generateTransactionNumber();
  const primaryFormatId = lineItems.length === 1 ? lineItems[0].book_format_id : null;

  const { data: transaction, error: txError } = await supabaseAdmin
    .from('transactions')
    .insert({
      user_id: userId,
      transaction_number: transactionNumber,
      book_format_id: primaryFormatId,
      amount: totalAmount,
      currency,
      status: 'pending',
    })
    .select()
    .single();

  if (txError) throw txError;

  const { error: itemsError } = await supabaseAdmin.from('transaction_items').insert(
    lineItems.map((item) => ({
      transaction_id: transaction.id,
      book_format_id: item.book_format_id,
      amount: item.amount,
    }))
  );

  if (itemsError) {
    await supabaseAdmin.from('transactions').delete().eq('id', transaction.id);
    throw itemsError;
  }

  return { transaction, transactionNumber, totalAmount, currency };
}

async function attachPaymentAndReturn(user, transaction, transactionNumber, totalAmount) {
  const { checkoutUrl, tx_ref, error } = await chapaService.initializePayment(transaction, user);

  if (error) throw new Error(typeof error === 'string' ? error : JSON.stringify(error));

  const { error: updateError } = await supabaseAdmin
    .from('transactions')
    .update({ payment_id: tx_ref })
    .eq('id', transaction.id);

  if (updateError) {
    logger.error('Failed to update payment_id', { error: updateError });
  }

  return {
    transaction_id: transaction.id,
    transaction_number: transactionNumber,
    checkout_url: checkoutUrl,
    amount: totalAmount,
  };
}

async function buildLineItemsFromFormatIds(userId, formatIds) {
  const uniqueIds = [...new Set(formatIds.filter(Boolean))];

  if (!uniqueIds.length) {
    const err = new Error('No formats selected');
    err.statusCode = 400;
    throw err;
  }

  try {
    await assertCanPurchaseFormats(userId, uniqueIds);
  } catch (error) {
    if (!error.statusCode && error.message?.includes('own book')) {
      error.statusCode = 403;
    }
    throw error;
  }

  const lineItems = [];

  for (const formatId of uniqueIds) {
    const { bookFormat, error } = await getBookFormat(formatId);
    if (error) {
      const err = new Error(error);
      err.statusCode = 404;
      throw err;
    }

    const price = parseFloat(bookFormat.price);
    if (!price || price <= 0) {
      const err = new Error('Invalid price for selected format');
      err.statusCode = 400;
      throw err;
    }

    lineItems.push({
      book_format_id: bookFormat.id,
      amount: price,
      currency: bookFormat.currency || 'ETB',
    });
  }

  return lineItems;
}

export const checkoutService = {
  async initializeSingleCheckout(userId, user, bookFormatId) {
    const lineItems = await buildLineItemsFromFormatIds(userId, [bookFormatId]);
    const { transaction, transactionNumber, totalAmount } = await createTransactionWithItems(
      userId,
      lineItems
    );

    logger.info('Single checkout initialized', { userId, transactionId: transaction.id });

    return attachPaymentAndReturn(user, transaction, transactionNumber, totalAmount);
  },

  async initializeFormatsCheckout(userId, user, bookFormatIds) {
    const lineItems = await buildLineItemsFromFormatIds(userId, bookFormatIds);
    const { transaction, transactionNumber, totalAmount } = await createTransactionWithItems(
      userId,
      lineItems
    );

    logger.info('Multi-format checkout initialized', {
      userId,
      transactionId: transaction.id,
      itemCount: lineItems.length,
    });

    return attachPaymentAndReturn(user, transaction, transactionNumber, totalAmount);
  },

  async initializeCartCheckout(userId, user) {
    const cart = await cartService.getCart(userId);

    if (!cart?.items?.length) {
      const err = new Error('Your cart is empty');
      err.statusCode = 400;
      throw err;
    }

    const formatIds = cart.items.map((item) => item.book_format_id);

    try {
      await assertCanPurchaseFormats(userId, formatIds);
    } catch (error) {
      if (!error.statusCode && error.message?.includes('own book')) {
        error.statusCode = 403;
      }
      throw error;
    }

    const lineItems = [];

    for (const item of cart.items) {
      const price = parseFloat(item.book_format?.price ?? 0);
      if (!price || price <= 0) {
        const err = new Error('One or more cart items have an invalid price');
        err.statusCode = 400;
        throw err;
      }

      lineItems.push({
        book_format_id: item.book_format_id,
        amount: price,
        currency: item.book_format?.currency || 'ETB',
      });
    }

    const { transaction, transactionNumber, totalAmount } = await createTransactionWithItems(
      userId,
      lineItems
    );

    logger.info('Cart checkout initialized', {
      userId,
      transactionId: transaction.id,
      itemCount: lineItems.length,
    });

    return attachPaymentAndReturn(user, transaction, transactionNumber, totalAmount);
  },

  /**
   * Fulfill a completed transaction: purchases, sales counts, cart cleanup.
   */
  async fulfillTransaction(transaction) {
    const { data: lineItems, error: itemsError } = await supabaseAdmin
      .from('transaction_items')
      .select('book_format_id, amount')
      .eq('transaction_id', transaction.id);

    if (itemsError) {
      logger.error('Failed to load transaction items', { error: itemsError.message });
      throw itemsError;
    }

    const formatIds =
      lineItems?.length > 0
        ? lineItems.map((row) => row.book_format_id)
        : transaction.book_format_id
          ? [transaction.book_format_id]
          : [];

    if (!formatIds.length) {
      logger.warn('No formats to fulfill for transaction', { transactionId: transaction.id });
      return;
    }

    for (const bookFormatId of formatIds) {
      const { error: purchaseError } = await supabaseAdmin.from('user_purchases').insert({
        user_id: transaction.user_id,
        book_format_id: bookFormatId,
        transaction_id: transaction.id,
      });

      if (purchaseError) {
        logger.error('Purchase insert error', {
          error: purchaseError.message,
          bookFormatId,
        });
      } else {
        logger.info('Purchase added', {
          userId: transaction.user_id,
          bookFormatId,
        });
      }

      const { data: bookFormat } = await supabaseAdmin
        .from('book_formats')
        .select('book_id')
        .eq('id', bookFormatId)
        .single();

      if (bookFormat?.book_id) {
        await supabaseAdmin.rpc('increment_book_sales', {
          book_id: bookFormat.book_id,
          amount: 1,
        });
      }
    }

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
        .in('book_format_id', formatIds);
      logger.info('Cart items cleared after purchase', {
        cartId: cart.id,
        count: formatIds.length,
      });
    }
  },

  /**
   * Parse our Chapa tx_ref: booknest-{transaction_number}-{timestamp}
   */
  parseBooknestTxRef(tx_ref) {
    const raw = String(tx_ref).replace(/^booknest-/i, '');
    const txnNumber = raw.replace(/-\d{10,}$/, '');
    return { raw, txnNumber };
  },

  /**
   * Find transaction by Chapa tx_ref (exact, booknest prefix, or transaction_number).
   */
  async findTransactionByTxRef(tx_ref) {
    if (!tx_ref) return null;

    const ref = String(tx_ref);
    const { txnNumber } = this.parseBooknestTxRef(ref);

    const { data: exact } = await supabaseAdmin
      .from('transactions')
      .select('id, user_id, book_format_id, status, payment_id, transaction_number')
      .eq('payment_id', ref)
      .maybeSingle();

    if (exact) return exact;

    if (txnNumber) {
      const { data: byNumber } = await supabaseAdmin
        .from('transactions')
        .select('id, user_id, book_format_id, status, payment_id, transaction_number')
        .eq('transaction_number', txnNumber)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (byNumber) return byNumber;
    }

    const searchKey = txnNumber || ref.replace(/^booknest-/i, '');
    const { data: recent } = await supabaseAdmin
      .from('transactions')
      .select('id, user_id, book_format_id, status, payment_id, transaction_number')
      .ilike('payment_id', `%${searchKey}%`)
      .order('created_at', { ascending: false })
      .limit(1);

    return recent?.[0] ?? null;
  },

  async hasPurchasesForTransaction(transactionId) {
    const { count, error } = await supabaseAdmin
      .from('user_purchases')
      .select('id', { count: 'exact', head: true })
      .eq('transaction_id', transactionId);

    if (error) return false;
    return (count ?? 0) > 0;
  },

  /**
   * Verify with Chapa and fulfill (fallback when webhook is delayed or missed).
   */
  async verifyAndFulfillPayment(tx_ref, userId) {
    const transaction = await this.findTransactionByTxRef(tx_ref);

    if (!transaction) {
      logger.warn('Verify: transaction not found', { tx_ref });
      return { verified: false, already_processed: false };
    }

    if (userId && transaction.user_id !== userId) {
      logger.warn('Verify: transaction belongs to another user', { tx_ref, userId });
      return { verified: false, already_processed: false };
    }

    if (transaction.status === 'completed') {
      return { verified: true, already_processed: true };
    }

    const fulfilled = await this.hasPurchasesForTransaction(transaction.id);
    if (fulfilled) {
      return { verified: true, already_processed: true };
    }

    const chapaRef = transaction.payment_id?.startsWith('booknest-')
      ? transaction.payment_id
      : tx_ref;
    const { verified, error } = await chapaService.verifyPayment(chapaRef);

    if (!verified) {
      logger.warn('Verify: Chapa payment not confirmed', { tx_ref, chapaRef, error });
      return { verified: false, already_processed: false };
    }

    const { error: updateError } = await supabaseAdmin
      .from('transactions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', transaction.id);

    if (updateError) {
      logger.error('Verify: failed to update transaction', { error: updateError.message });
      throw updateError;
    }

    await this.fulfillTransaction(transaction);

    logger.info('Payment verified and fulfilled via API', {
      transactionId: transaction.id,
      tx_ref,
    });

    return { verified: true, already_processed: false };
  },
};
