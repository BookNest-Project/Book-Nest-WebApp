import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

export const wishlistRepository = {
  async addItem(userId, bookId) {
    try {
      const { data, error } = await supabaseAdmin
        .from('wishlist')
        .insert({ reader_user_id: userId, book_id: bookId })
        .select('id, book_id, created_at')
        .single();

      if (error) {
        if (error.code === '23505') {
          return { item: null, error: 'Book already in wishlist' };
        }
        logger.error('Wishlist add error', { userId, bookId, error: error.message });
        return { item: null, error: error.message };
      }

      return { item: data, error: null };
    } catch (error) {
      logger.error('Wishlist add unexpected error', { error: error.message });
      return { item: null, error: error.message };
    }
  },

  async removeItem(userId, bookId) {
    try {
      const { error } = await supabaseAdmin
        .from('wishlist')
        .delete()
        .eq('reader_user_id', userId)
        .eq('book_id', bookId);

      if (error) {
        logger.error('Wishlist remove error', { userId, bookId, error: error.message });
        return { error: error.message };
      }

      return { error: null };
    } catch (error) {
      logger.error('Wishlist remove unexpected error', { error: error.message });
      return { error: error.message };
    }
  },

async getUserWishlist(userId, page = 1, limit = 20) {
  try {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // First get the wishlist items with book info
    let query = supabaseAdmin
      .from('wishlist')
      .select(`
        id,
        reader_user_id,
        book_id,
        created_at,
        book:books!inner (
          id,
          title,
          author_name,
          cover_image_url,
          status
        )
      `)
      .eq('reader_user_id', userId)
      .eq('book.status', 'approved')
      .order('created_at', { ascending: false });

    // Get total count first
    const { count, error: countError } = await supabaseAdmin
      .from('wishlist')
      .select('id', { count: 'exact', head: true })
      .eq('reader_user_id', userId);

    if (countError) {
      logger.error('Wishlist count error', { userId, error: countError.message });
      return { items: [], total: 0, pagination: { page, limit, total: 0, totalPages: 0 }, error: countError.message };
    }

    // Apply pagination
    const { data: items, error } = await query.range(from, to);

    if (error) {
      logger.error('Wishlist fetch error', { userId, error: error.message });
      return { items: [], total: 0, pagination: { page, limit, total: 0, totalPages: 0 }, error: error.message };
    }

    // Get formats for each book
    const bookIds = items.map(item => item.book?.id).filter(Boolean);
    let formatsMap = {};

    if (bookIds.length > 0) {
      const { data: formats, error: formatsError } = await supabaseAdmin
        .from('book_formats')
        .select('book_id, format_type, price, currency')
        .in('book_id', bookIds);

      if (!formatsError && formats) {
        formatsMap = formats.reduce((acc, format) => {
          if (!acc[format.book_id]) acc[format.book_id] = [];
          acc[format.book_id].push({
            format_type: format.format_type,
            price: parseFloat(format.price),
            currency: format.currency,
          });
          return acc;
        }, {});
      }
    }

    const itemsWithFormats = items.map(item => ({
      ...item,
      book: item.book ? {
        ...item.book,
        formats: formatsMap[item.book.id] || [],
      } : null,
    })).filter(item => item.book !== null);

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    return { 
      items: itemsWithFormats, 
      total, 
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      error: null 
    };
  } catch (error) {
    logger.error('Wishlist fetch unexpected error', { error: error.message });
    return { 
      items: [], 
      total: 0, 
      pagination: { page, limit, total: 0, totalPages: 0 }, 
      error: error.message 
    };
}
},

  async isInWishlist(userId, bookId) {
    try {
      const { data, error } = await supabaseAdmin
        .from('wishlist')
        .select('id')
        .eq('reader_user_id', userId)
        .eq('book_id', bookId)
        .maybeSingle();

      if (error) {
        logger.error('Wishlist check error', { userId, bookId, error: error.message });
        return { isInWishlist: false, error: error.message };
      }

      return { isInWishlist: !!data, error: null };
    } catch (error) {
      logger.error('Wishlist check unexpected error', { error: error.message });
      return { isInWishlist: false, error: error.message };
    }
  },

  async getWishlistCount(userId) {
    try {
      const { count, error } = await supabaseAdmin
        .from('wishlist')
        .select('id', { count: 'exact', head: true })
        .eq('reader_user_id', userId);

      if (error) {
        logger.error('Wishlist count error', { userId, error: error.message });
        return { count: 0, error: error.message };
      }

      return { count: count || 0, error: null };
    } catch (error) {
      logger.error('Wishlist count unexpected error', { error: error.message });
      return { count: 0, error: error.message };
    }
  },
};