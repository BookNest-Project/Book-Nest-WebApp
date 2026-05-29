import { supabaseAdmin } from '../config/supabase.js';
import { readingActivityService } from './readingActivityService.js';

export const progressService = {
  async syncProgress(userId, payload) {
    const {
      book_format_id,
      progress_percent,
      last_position,
      pages_delta = 0,
      minutes_delta = 0,
      timezone_offset_minutes = 0,
    } = payload;

    const { data: purchase } = await supabaseAdmin
      .from('user_purchases')
      .select('id')
      .eq('user_id', userId)
      .eq('book_format_id', book_format_id)
      .maybeSingle();

    if (!purchase) {
      const err = new Error('You do not own this book');
      err.statusCode = 403;
      throw err;
    }

    const percent = Math.min(100, Math.max(0, Math.floor(progress_percent || 0)));
    const completedAt = percent >= 100 ? new Date().toISOString() : null;
    const wasCompleted = percent >= 100;

    const { data: existing } = await supabaseAdmin
      .from('reading_progress')
      .select('id, progress_percent, completed_at')
      .eq('user_id', userId)
      .eq('book_format_id', book_format_id)
      .maybeSingle();

    const updatePayload = {
      progress_percent: percent,
      last_position: last_position != null ? { value: last_position } : null,
      updated_at: new Date().toISOString(),
      ...(completedAt && !existing?.completed_at ? { completed_at: completedAt } : {}),
    };

    if (existing) {
      await supabaseAdmin.from('reading_progress').update(updatePayload).eq('id', existing.id);
    } else {
      await supabaseAdmin.from('reading_progress').insert({
        user_id: userId,
        book_format_id,
        ...updatePayload,
        completed_at: completedAt,
      });
    }

    const newlyCompleted = wasCompleted && !existing?.completed_at;

    await readingActivityService.recordSession(userId, {
      pages_delta,
      minutes_delta,
      books_active: 1,
      timezone_offset_minutes,
      book_completed: newlyCompleted,
    });

    return { success: true, completed: wasCompleted, newly_completed: newlyCompleted };
  },

  async getAllProgress(userId) {
    const { data, error } = await supabaseAdmin
      .from('reading_progress')
      .select('book_format_id, progress_percent, last_position, completed_at, updated_at')
      .eq('user_id', userId);

    if (error) throw error;
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
