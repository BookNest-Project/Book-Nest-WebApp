import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

export const cartRepository = {
  async getOrCreateCart(userId) {
    try {
      let { data: cart, error } = await supabaseAdmin
        .from('carts')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (error && error.code === 'PGRST116') {
        const { data: newCart, error: insertError } = await supabaseAdmin
          .from('carts')
          .insert({ user_id: userId })
          .select()
          .single();

        if (insertError) throw insertError;
        cart = newCart;
      } else if (error) {
        throw error;
      }

      const { data: items, error: itemsError } = await supabaseAdmin
        .from('cart_items')
        .select(`
          id,
          cart_id,
          book_format_id,
          added_at,
          book_format:book_formats!inner (
            id,
            format_type,
            price,
            currency,
            book:books!inner (
              id,
              title,
              cover_image_url,
              author_name
            )
          )
        `)
        .eq('cart_id', cart.id);

      if (itemsError) throw itemsError;

      let total = 0;
      const formattedItems = (items || []).map(item => {
        const price = parseFloat(item.book_format.price);
        total += price;
        return {
          ...item,
          book_format: {
            ...item.book_format,
            price: price,
            book: item.book_format.book,
          },
        };
      });

      return {
        cart: { id: cart.id, user_id: userId, items: formattedItems, total },
        error: null,
      };
    } catch (error) {
      logger.error('Get cart error', { userId, error: error.message });
      return { cart: null, error: error.message };
    }
  },

  async addItem(cartId, bookFormatId) {
    try {
      const { data, error } = await supabaseAdmin
        .from('cart_items')
        .insert({ cart_id: cartId, book_format_id: bookFormatId })
        .select()
        .single();

      if (error) throw error;
      return { item: data, error: null };
    } catch (error) {
      logger.error('Add cart item error', { cartId, bookFormatId, error: error.message });
      return { item: null, error: error.message };
    }
  },

  async removeItem(itemId) {
    try {
      const { error } = await supabaseAdmin
        .from('cart_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
      return { error: null };
    } catch (error) {
      logger.error('Remove cart item error', { itemId, error: error.message });
      return { error: error.message };
    }
  },

  async clearCart(cartId) {
    try {
      const { error } = await supabaseAdmin
        .from('cart_items')
        .delete()
        .eq('cart_id', cartId);

      if (error) throw error;
      return { error: null };
    } catch (error) {
      logger.error('Clear cart error', { cartId, error: error.message });
      return { error: error.message };
    }
  },
};