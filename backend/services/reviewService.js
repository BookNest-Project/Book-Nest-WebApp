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
    const existing = await this.getUserReviewForBook(userId, bookId);
    if (existing) {
      const err = new Error('You already reviewed this book');
      err.statusCode = 409;
      throw err;
    }

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

  async listForSeller(userId, { limit = 50, offset = 0 } = {}) {
    const { data: books, error: booksError } = await supabaseAdmin
      .from('books')
      .select('id, title, cover_image_url')
      .eq('uploaded_by', userId);

    if (booksError) throw booksError;

    const bookIds = (books || []).map((b) => b.id);
    if (!bookIds.length) {
      return { reviews: [], total: 0, summary: { total_reviews: 0, avg_rating: 0 } };
    }

    const bookMeta = Object.fromEntries(
      (books || []).map((b) => [b.id, { title: b.title, cover_image_url: b.cover_image_url }])
    );

    const { data: reviews, error, count } = await supabaseAdmin
      .from('book_reviews')
      .select(
        `
        id, rating, body, reviewer_role, created_at, book_id,
        user:users!book_reviews_user_id_fkey(id, email, role)
      `,
        { count: 'exact' }
      )
      .in('book_id', bookIds)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const mapped = (reviews || []).map((row) => ({
      id: row.id,
      rating: row.rating,
      body: row.body,
      reviewer_role: row.reviewer_role,
      created_at: row.created_at,
      book_id: row.book_id,
      book_title: bookMeta[row.book_id]?.title || 'Unknown book',
      book_cover_url: bookMeta[row.book_id]?.cover_image_url || null,
      user: {
        id: row.user?.id,
        display_name: row.user?.email?.split('@')[0] || 'Reader',
      },
    }));

    const { data: allRatings } = await supabaseAdmin
      .from('book_reviews')
      .select('rating')
      .in('book_id', bookIds);

    const totalReviews = allRatings?.length || 0;
    const avgRating =
      totalReviews > 0
        ? (allRatings || []).reduce((s, r) => s + (r.rating || 0), 0) / totalReviews
        : 0;

    return {
      reviews: mapped,
      total: count ?? totalReviews,
      summary: {
        total_reviews: totalReviews,
        avg_rating: avgRating,
      },
    };
  },
};
