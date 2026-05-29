import { supabaseAdmin } from '../config/supabase.js';
import { formatSuccess } from '../utils/responseFormatter.js';
import { logger } from '../utils/logger.js';

const SCHEMA_NOTICE =
  'Run backend/scripts/admin-approval-extensions.sql in Supabase (or npm run setup:approval with SUPABASE_DB_URL).';

async function loadBookReviewFeedback(userId, limit) {
  const { data, error } = await supabaseAdmin
    .from('books')
    .select('id, title, status, review_note, reviewed_at, updated_at')
    .or(`author_user_id.eq.${userId},uploaded_by.eq.${userId}`)
    .in('status', ['rejected', 'approved'])
    .not('review_note', 'is', null)
    .order('reviewed_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    if (error.message?.includes('review_note')) {
      return { items: [], missingColumn: true };
    }
    logger.warn('loadBookReviewFeedback', { error: error.message });
    return { items: [] };
  }

  return {
    items: (data ?? []).map((book) => ({
      id: `book-feedback-${book.id}`,
      book_id: book.id,
      subject:
        book.status === 'rejected'
          ? `Book rejected: ${book.title}`
          : `Book approved: ${book.title}`,
      body: book.review_note,
      message_type: 'book_review',
      read_at: null,
      created_at: book.reviewed_at || book.updated_at,
      books: { id: book.id, title: book.title, status: book.status },
      source: 'book',
    })),
  };
}

export const messageController = {
  /** GET /api/messages — inbox for logged-in author/publisher */
  async getMyMessages(req, res, next) {
    try {
      const userId = req.user.id;
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

      const [inboxResult, bookFeedback] = await Promise.all([
        supabaseAdmin
          .from('author_messages')
          .select(
            `
          id,
          book_id,
          subject,
          body,
          message_type,
          read_at,
          created_at,
          books ( id, title, status )
        `,
          )
          .eq('recipient_user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit),
        loadBookReviewFeedback(userId, limit),
      ]);

      const { data, error } = inboxResult;
      let inboxItems = [];
      let notice = null;

      if (error) {
        if (
          error.message?.includes('author_messages') ||
          error.message?.includes('schema cache')
        ) {
          notice = SCHEMA_NOTICE;
        } else {
          throw error;
        }
      } else {
        inboxItems = (data ?? []).map((row) => ({ ...row, source: 'inbox' }));
      }

      const merged = [...inboxItems, ...bookFeedback.items]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .slice(0, limit);

      if (!merged.length && (notice || bookFeedback.missingColumn)) {
        notice = notice || SCHEMA_NOTICE;
      }

      res.status(200).json(
        formatSuccess(
          { items: merged, notice },
          merged.length ? 'Messages retrieved successfully' : 'No messages',
        ),
      );
    } catch (error) {
      next(error);
    }
  },

  async markMessageRead(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const { data, error } = await supabaseAdmin
        .from('author_messages')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .eq('recipient_user_id', userId)
        .select('id, read_at')
        .single();

      if (error) throw error;

      res.status(200).json(formatSuccess(data, 'Message marked as read'));
    } catch (error) {
      next(error);
    }
  },
};
