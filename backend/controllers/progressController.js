import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

export const progressController = {
  async syncProgress(req, res, next) {
    try {
      const userId = req.user.id;
      const { book_format_id, progress_percent, last_position } = req.body;

      if (!book_format_id) {
        return res.status(400).json({ error: 'book_format_id required' });
      }

      // Check if user owns this book
      const { data: purchase, error: purchaseError } = await supabaseAdmin
        .from('user_purchases')
        .select('id')
        .eq('user_id', userId)
        .eq('book_format_id', book_format_id)
        .single();

      if (purchaseError || !purchase) {
        return res.status(403).json({ error: 'You do not own this book' });
      }

      // Upsert progress
      const { data: existing } = await supabaseAdmin
        .from('reading_progress')
        .select('id')
        .eq('user_id', userId)
        .eq('book_format_id', book_format_id)
        .single();

      if (existing) {
        await supabaseAdmin
          .from('reading_progress')
          .update({
            progress_percent: progress_percent,
            last_position: last_position,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await supabaseAdmin
          .from('reading_progress')
          .insert({
            user_id: userId,
            book_format_id: book_format_id,
            progress_percent: progress_percent,
            last_position: last_position,
          });
      }

      logger.info('Progress synced', { userId, book_format_id, progress_percent });

      res.status(200).json({ success: true, message: 'Progress synced' });
    } catch (error) {
      logger.error('Sync progress error', { error: error.message });
      next(error);
    }
  },
};