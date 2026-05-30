import { supabaseAdmin } from '../config/supabase.js';
import { readingActivityService } from './readingActivityService.js';

export const progressService = {
  async syncProgress(userId, payload) {
    const {
      book_format_id,
      progress_percent,
      last_position,
      timezone_offset_minutes = 0,
    } = payload;

    if (!book_format_id) {
      const err = new Error('book_format_id is required');
      err.statusCode = 400;
      throw err;
    }

    const { data: purchase, error: purchaseError } = await supabaseAdmin
      .from('user_purchases')
      .select('id')
      .eq('user_id', userId)
      .eq('book_format_id', book_format_id)
      .maybeSingle();

    if (purchaseError) {
      const err = new Error('Could not verify book ownership');
      err.statusCode = 500;
      throw err;
    }

    if (!purchase) {
      const err = new Error('You do not own this book');
      err.statusCode = 403;
      throw err;
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('reading_progress')
      .select('id, progress_percent, completed_at')
      .eq('user_id', userId)
      .eq('book_format_id', book_format_id)
      .maybeSingle();

    if (existingError) {
      const err = new Error(
        existingError.message?.includes('reading_progress')
          ? 'Reading progress is not set up on the server. Run the post-purchase database migration.'
          : 'Could not load reading progress'
      );
      err.statusCode = 500;
      throw err;
    }

    const incomingPercent = Math.min(100, Math.max(0, Math.floor(progress_percent || 0)));
    const existingPercent = existing?.progress_percent ?? 0;
    const finalPercent = existing?.completed_at ? 100 : Math.max(existingPercent, incomingPercent);
    const completedAt =
      finalPercent >= 100
        ? existing?.completed_at ?? new Date().toISOString()
        : existing?.completed_at ?? null;
    const wasCompleted = finalPercent >= 100;

    const updatePayload = {
      progress_percent: finalPercent,
      last_position: last_position != null ? { value: Number(last_position) } : null,
      updated_at: new Date().toISOString(),
      ...(completedAt && !existing?.completed_at ? { completed_at: completedAt } : {}),
    };

    if (existing) {
      const { error: updateError } = await supabaseAdmin
        .from('reading_progress')
        .update(updatePayload)
        .eq('id', existing.id);

      if (updateError) {
        const err = new Error(updateError.message || 'Failed to save reading progress');
        err.statusCode = 500;
        throw err;
      }
    } else {
      const { error: insertError } = await supabaseAdmin.from('reading_progress').insert({
        user_id: userId,
        book_format_id,
        ...updatePayload,
        completed_at: completedAt,
      });

      if (insertError) {
        const err = new Error(insertError.message || 'Failed to save reading progress');
        err.statusCode = 500;
        throw err;
      }
    }

    const newlyCompleted = wasCompleted && !existing?.completed_at;

    if (newlyCompleted) {
      try {
        await readingActivityService.recordSession(userId, {
          timezone_offset_minutes,
          book_completed: true,
        });
      } catch {
        // Progress saved; gamification is best-effort
      }
    }

    return { success: true, completed: wasCompleted, newly_completed: newlyCompleted };
  },

  async getAllProgress(userId) {
    const { data, error } = await supabaseAdmin
      .from('reading_progress')
      .select('book_format_id, progress_percent, last_position, completed_at, updated_at')
      .eq('user_id', userId);

    if (error) {
      if (error.message?.includes('reading_progress')) return [];
      throw error;
    }

    return (data || []).map((row) => ({
      book_format_id: row.book_format_id,
      progress_percent: row.progress_percent,
      last_position:
        row.last_position && typeof row.last_position === 'object'
          ? row.last_position.value ?? row.last_position
          : row.last_position,
      completed_at: row.completed_at,
      updated_at: row.updated_at,
    }));
  },

  async getProgressForFormat(userId, bookFormatId) {
    const { data, error } = await supabaseAdmin
      .from('reading_progress')
      .select('book_format_id, progress_percent, last_position, completed_at, updated_at')
      .eq('user_id', userId)
      .eq('book_format_id', bookFormatId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      book_format_id: data.book_format_id,
      progress_percent: data.progress_percent,
      last_position:
        data.last_position && typeof data.last_position === 'object'
          ? data.last_position.value ?? data.last_position
          : data.last_position,
      completed_at: data.completed_at,
      updated_at: data.updated_at,
    };
  },
};
