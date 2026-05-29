import { supabaseAdmin } from '../config/supabase.js';

export const reviewService = {
  async listForBook(bookId, { limit = 20, offset = 0 } = {}) {
    const { data, error } = await supabaseAdmin
      .from('book_reviews')
      .select(
        `
        id, rating, body, reviewer_role, created_at,
        user:users!book_reviews_user_id_fkey(id, email, role)
      `
      )
      .eq('book_id', bookId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return (data || []).map((row) => ({
      id: row.id,
      rating: row.rating,
      body: row.body,
      reviewer_role: row.reviewer_role,
      created_at: row.created_at,
      user: {
        id: row.user?.id,
        display_name: row.user?.email?.split('@')[0] || 'Reader',
      },
    }));
  },

  async canReview(userId, bookId) {
    const { data: formats } = await supabaseAdmin
      .from('book_formats')
      .select('id')
      .eq('book_id', bookId);

    const formatIds = (formats || []).map((f) => f.id);
    if (!formatIds.length) return false;

    const { data: progress } = await supabaseAdmin
      .from('reading_progress')
      .select('progress_percent, completed_at')
      .eq('user_id', userId)
      .in('book_format_id', formatIds);

    return (progress || []).some(
      (p) => p.completed_at || (p.progress_percent != null && p.progress_percent >= 100)
    );
  },

  async createReview(userId, userRole, bookId, { rating, body }) {
    const eligible = await this.canReview(userId, bookId);
    if (!eligible) {
      const err = new Error('Complete the book before leaving a review');
      err.statusCode = 403;
      throw err;
    }

    const roleSnapshot =
      userRole === 'author' || userRole === 'publisher' ? userRole : 'reader';

    const { data, error } = await supabaseAdmin
      .from('book_reviews')
      .insert({
        book_id: bookId,
        user_id: userId,
        rating,
        body: body || null,
        reviewer_role: roleSnapshot,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        const err = new Error('You already reviewed this book');
        err.statusCode = 409;
        throw err;
      }
      throw error;
    }

    return data;
  },

  async getUserReviewForBook(userId, bookId) {
    const { data } = await supabaseAdmin
      .from('book_reviews')
      .select('id, rating, body, reviewer_role, created_at')
      .eq('user_id', userId)
      .eq('book_id', bookId)
      .maybeSingle();

    return data;
  },
};
