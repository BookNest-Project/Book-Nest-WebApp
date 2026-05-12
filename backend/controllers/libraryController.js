import { libraryService } from '../services/libraryService.js';
import { formatSuccess } from '../utils/responseFormatter.js';
import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

export const libraryController = {
async getLibrary(req, res, next) {
  try {
    const userId = req.user.id;

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
            author_name,
            cover_image_url,
            language,
            publication_date,
            description,
            publisher_name
          )
        )
      `)
      .eq('user_id', userId)
      .order('purchased_at', { ascending: false });

    if (error) {
      logger.error('Get library query error', { error: error.message });
      throw error;
    }

    console.log('Purchases found:', purchases?.length);

    const libraryWithUrls = await Promise.all((purchases || []).map(async (purchase) => {
      let fileUrl = null;
      const storagePath = purchase.book_format.storage_path;
      
      console.log('Processing book:', purchase.book_format.book.title);
      console.log('Storage path:', storagePath);
      
      if (storagePath) {
        try {
          const { data: signedUrl, error: signError } = await supabaseAdmin.storage
            .from('booknest')
            .createSignedUrl(storagePath, 60 * 60);
          
          if (signError) {
            console.error('Signed URL error:', signError.message);
          } else {
            fileUrl = signedUrl?.signedUrl;
            console.log('Signed URL generated:', !!fileUrl);
          }
        } catch (err) {
          console.error('Signed URL exception:', err.message);
        }
      }

      return {
        id: purchase.id,
        purchased_at: purchase.purchased_at,
        format: {
          id: purchase.book_format.id,
          type: purchase.book_format.format_type,
          price: purchase.book_format.price,
          currency: purchase.book_format.currency,
          storage_path: storagePath,
          file_url: fileUrl,
          page_count: purchase.book_format.page_count,
          duration_sec: purchase.book_format.duration_sec,
        },
        book: {
          id: purchase.book_format.book.id,
          title: purchase.book_format.book.title,
          author_name: purchase.book_format.book.author_name,
          cover_image_url: purchase.book_format.book.cover_image_url,
          language: purchase.book_format.book.language,
        },
      };
    }));

    console.log('Returning library with', libraryWithUrls.length, 'books');
    console.log('First book file_url:', libraryWithUrls[0]?.format?.file_url);

    res.status(200).json({
      success: true,
      data: libraryWithUrls,
    });
  } catch (error) {
    logger.error('Get library error', { error: error.message });
    next(error);
  }
},
  /**
   * Check if user has purchased a specific book
   * GET /api/library/check/:bookFormatId
   */
  async checkPurchase(req, res, next) {
    try {
      const userId = req.user.id;
      const { bookFormatId } = req.params;

      const hasPurchased = await libraryService.hasPurchased(userId, bookFormatId);

      res.status(200).json(formatSuccess({ hasPurchased }, 'Purchase status checked'));
    } catch (error) {
      next(error);
    }
  },
};