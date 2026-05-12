import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

export const libraryRepository = {
  /**
   * Get user's purchased books
   */
  async getUserLibrary(userId) {
    try {
      const { data: purchases, error } = await supabaseAdmin
        .from('user_purchases')
        .select(`
          id,
          purchased_at,
          book_format:book_formats!inner (
            id,
            format_type,
            price,
            currency,
            storage_path,
            page_count,
            duration_sec,
            file_size_bytes,
            book:books!inner (
              id,
              title,
              subtitle,
              description,
              isbn,
              author_name,
              publisher_name,
              language,
              publication_date,
              cover_image_url,
              status,
              created_at
            )
          )
        `)
        .eq('user_id', userId)
        .order('purchased_at', { ascending: false });

      if (error) throw error;

      // Format the response
      const library = (purchases || []).map(purchase => ({
        id: purchase.id,
        purchased_at: purchase.purchased_at,
        format: {
          id: purchase.book_format.id,
          type: purchase.book_format.format_type,
          price: purchase.book_format.price,
          currency: purchase.book_format.currency,
          storage_path: purchase.book_format.storage_path,
          page_count: purchase.book_format.page_count,
          duration_sec: purchase.book_format.duration_sec,
          file_size_bytes: purchase.book_format.file_size_bytes,
        },
        book: {
          id: purchase.book_format.book.id,
          title: purchase.book_format.book.title,
          subtitle: purchase.book_format.book.subtitle,
          description: purchase.book_format.book.description,
          isbn: purchase.book_format.book.isbn,
          author_name: purchase.book_format.book.author_name,
          publisher_name: purchase.book_format.book.publisher_name,
          language: purchase.book_format.book.language,
          publication_date: purchase.book_format.book.publication_date,
          cover_image_url: purchase.book_format.book.cover_image_url,
          status: purchase.book_format.book.status,
          created_at: purchase.book_format.book.created_at,
        },
      }));

      return { library, error: null };
    } catch (error) {
      logger.error('Get user library error', { userId, error: error.message, stack: error.stack });
      return { library: [], error: error.message };
    }
  },

  /**
   * Check if user has purchased a specific book format
   */
  async hasPurchased(userId, bookFormatId) {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_purchases')
        .select('id')
        .eq('user_id', userId)
        .eq('book_format_id', bookFormatId)
        .maybeSingle();

      if (error) throw error;
      return { hasPurchased: !!data, error: null };
    } catch (error) {
      logger.error('Check purchase error', { userId, bookFormatId, error: error.message });
      return { hasPurchased: false, error: error.message };
    }
  },
};