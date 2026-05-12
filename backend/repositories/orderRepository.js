import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

export const orderRepository = {
  /**
   * Create order from cart
   */
  async createOrder(userId, cart, shippingAddress) {
    try {
      // Generate unique order number
      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      // Create order
      const { data: order, error: orderError } = await supabaseAdmin
        .from('orders')
        .insert({
          user_id: userId,
          order_number: orderNumber,
          total_amount: cart.total,
          currency: 'ETB',
          status: 'pending',
          payment_method: 'chapa',
          payment_status: 'pending',
          shipping_address: shippingAddress,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItems = cart.items.map(item => ({
        order_id: order.id,
        book_format_id: item.book_format_id,
        book_id: item.book_format.book.id,
        book_title: item.book_format.book.title,
        format_type: item.book_format.format_type,
        price: item.book_format.price,
        currency: 'ETB',
        quantity: item.quantity,
      }));

      const { error: itemsError } = await supabaseAdmin
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      return { order, error: null };
    } catch (error) {
      logger.error('Create order error', { userId, error: error.message });
      return { order: null, error: error.message };
    }
  },

  /**
   * Update order payment status
   */
  async updateOrderPayment(orderId, paymentId, paymentStatus, orderStatus) {
    try {
      const { error } = await supabaseAdmin
        .from('orders')
        .update({
          payment_id: paymentId,
          payment_status: paymentStatus,
          status: orderStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      if (error) throw error;
      return { error: null };
    } catch (error) {
      logger.error('Update order payment error', { orderId, error: error.message });
      return { error: error.message };
    }
  },

  /**
   * Create user purchase records after successful payment
   */
  async createUserPurchases(userId, orderId) {
    try {
      // Get order items
      const { data: items, error: itemsError } = await supabaseAdmin
        .from('order_items')
        .select('book_format_id')
        .eq('order_id', orderId);

      if (itemsError) throw itemsError;

      // Insert purchases
      const purchases = items.map(item => ({
        user_id: userId,
        book_format_id: item.book_format_id,
        order_id: orderId,
      }));

      const { error: purchaseError } = await supabaseAdmin
        .from('user_purchases')
        .insert(purchases);

      if (purchaseError) throw purchaseError;

      // Update book sales count
      for (const item of items) {
        // Get book_id from book_format
        const { data: format } = await supabaseAdmin
          .from('book_formats')
          .select('book_id')
          .eq('id', item.book_format_id)
          .single();

        if (format) {
          await supabaseAdmin.rpc('increment_book_sales', {
            book_id: format.book_id,
            amount: 1,
          });
        }
      }

      return { error: null };
    } catch (error) {
      logger.error('Create user purchases error', { userId, orderId, error: error.message });
      return { error: error.message };
    }
  },
};