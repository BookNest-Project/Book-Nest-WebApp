import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { buildBookSnapshot, formatsToSnapshot } from '../utils/bookSnapshot.js';
import { bookReviewWorkflowRepository } from './bookReviewWorkflowRepository.js';

export const BOOK_SELECT = `
  id,
  isbn,
  title,
  subtitle,
  description,
  genre_id,
  author_name,
  author_user_id,
  publisher_name,
  publisher_user_id,
  language,
  publication_date,
  cover_image_url,
  cover_image_path,
  status,
  uploaded_by,
  reviewed_by_admin_id,
  reviewed_at,
  review_note,
  review_metadata,
  submission_previous,
  version_number,
  review_state,
  created_at,
  updated_at
`;

const BOOK_SELECT_FALLBACK = `
  id,
  isbn,
  title,
  subtitle,
  description,
  genre_id,
  author_name,
  author_user_id,
  publisher_name,
  publisher_user_id,
  language,
  publication_date,
  cover_image_url,
  cover_image_path,
  status,
  uploaded_by,
  reviewed_by_admin_id,
  reviewed_at,
  created_at,
  updated_at
`;

let useExtendedColumns = true;

async function selectBooks() {
  const cols = useExtendedColumns ? BOOK_SELECT : BOOK_SELECT_FALLBACK;
  return cols;
}

function stripMissingColumnError(error) {
  if (
    error?.message?.includes('review_note') ||
    error?.message?.includes('review_metadata') ||
    error?.message?.includes('submission_previous') ||
    error?.message?.includes('version_number') ||
    error?.message?.includes('review_state')
  ) {
    useExtendedColumns = false;
    return true;
  }
  return false;
}

export const adminApprovalRepository = {
  async countByStatus(status) {
    const { count, error } = await supabaseAdmin
      .from('books')
      .select('id', { count: 'exact', head: true })
      .eq('status', status);

    if (error) throw error;
    return count ?? 0;
  },

  async countPending() {
    return this.countByStatus('pending_review');
  },

  async countResubmitted() {
    const cols = await selectBooks();
    let query = supabaseAdmin
      .from('books')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_review')
      .not('reviewed_by_admin_id', 'is', null);

    let { count, error } = await query;
    if (error && stripMissingColumnError(error)) return 0;
    if (error) throw error;
    return count ?? 0;
  },

  async countAllBooks() {
    const { count, error } = await supabaseAdmin
      .from('books')
      .select('id', { count: 'exact', head: true });
    if (error) throw error;
    return count ?? 0;
  },

  async countAuthors() {
    const { count, error } = await supabaseAdmin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'author');
    if (error) throw error;
    return count ?? 0;
  },

  async countAuthorBooks(authorUserId) {
    if (!authorUserId) return 0;
    const { count, error } = await supabaseAdmin
      .from('books')
      .select('id', { count: 'exact', head: true })
      .or(`author_user_id.eq.${authorUserId},uploaded_by.eq.${authorUserId}`);
    if (error) return 0;
    return count ?? 0;
  },

  async countReviewedToday() {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const { count, error } = await supabaseAdmin
      .from('books')
      .select('id', { count: 'exact', head: true })
      .in('status', ['approved', 'rejected'])
      .gte('reviewed_at', startOfDay.toISOString());

    if (error) throw error;
    return count ?? 0;
  },

  async findBooksByStatus({ status, page, limit, search, submissionType, sort = 'newest' }) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const cols = await selectBooks();

    const ascending = sort === 'oldest' || sort === 'title_asc';
    const orderCol = sort === 'title_asc' || sort === 'title_desc' ? 'title' : 'updated_at';

    let query = supabaseAdmin.from('books').select(cols, { count: 'exact' }).order(orderCol, {
      ascending,
    });

    if (status === 'all') {
      query = query.neq('status', 'archived');
    } else {
      query = query.eq('status', status);
    }

    if (status === 'pending_review') {
      if (submissionType === 'new_entry') {
        query = query.is('reviewed_by_admin_id', null);
      } else if (submissionType === 'metadata_update') {
        query = query.not('reviewed_by_admin_id', 'is', null);
      } else if (submissionType === 'resubmitted') {
        query = query.not('reviewed_by_admin_id', 'is', null);
      }
    }

    if (search) {
      const term = `%${search}%`;
      query = query.or(`title.ilike.${term},isbn.ilike.${term},author_name.ilike.${term}`);
    }

    let { data, error, count } = await query.range(from, to);

    if (error && stripMissingColumnError(error)) {
      return this.findBooksByStatus({ status, page, limit, search, submissionType, sort });
    }

    if (error) {
      if (useExtendedColumns) {
        logger.warn('findBooksByStatus retrying with fallback columns', {
          status,
          error: error.message,
        });
        useExtendedColumns = false;
        return this.findBooksByStatus({ status, page, limit, search, submissionType, sort });
      }
      throw error;
    }

    return { books: data ?? [], total: count ?? 0 };
  },

  async findPendingBooks(opts) {
    return this.findBooksByStatus({ ...opts, status: 'pending_review' });
  },

  /**
   * Direct pending fetch (stable columns only) — matches original /books/pending behavior.
   */
  async findAllPendingBooks({ page = 1, limit = 20, search = '', sort = 'newest' }) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const ascending = sort === 'oldest' || sort === 'title_asc';
    const orderCol = sort === 'title_asc' || sort === 'title_desc' ? 'title' : 'updated_at';

    let query = supabaseAdmin
      .from('books')
      .select(BOOK_SELECT_FALLBACK, { count: 'exact' })
      .eq('status', 'pending_review')
      .order(orderCol, { ascending });

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`title.ilike.${term},isbn.ilike.${term},author_name.ilike.${term}`);
    }

    const { data, error, count } = await query.range(from, to);
    if (error) throw error;
    return { books: data ?? [], total: count ?? 0 };
  },

  async findAdminUsers() {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('role', 'admin')
      .eq('account_status', 'active');

    if (error) return [];
    return data ?? [];
  },

  async findBookById(id) {
    const cols = await selectBooks();
    let { data, error } = await supabaseAdmin.from('books').select(cols).eq('id', id).single();

    if (error && stripMissingColumnError(error)) {
      ({ data, error } = await supabaseAdmin
        .from('books')
        .select(BOOK_SELECT_FALLBACK)
        .eq('id', id)
        .single());
    }

    if (error) {
      ({ data, error } = await supabaseAdmin
        .from('books')
        .select(BOOK_SELECT_FALLBACK)
        .eq('id', id)
        .single());
    }

    if (error) return null;
    return data;
  },

  async updateBookStatusSimple(id, status, adminId) {
    const reviewed = {
      reviewed_by_admin_id: adminId,
      reviewed_at: new Date().toISOString(),
    };

    let { data, error } = await supabaseAdmin
      .from('books')
      .update({ status, ...reviewed })
      .eq('id', id)
      .select(BOOK_SELECT_FALLBACK)
      .single();

    if (
      error &&
      (error.message?.includes('reviewed_by_admin_id') ||
        error.message?.includes('reviewed_at'))
    ) {
      ({ data, error } = await supabaseAdmin
        .from('books')
        .update({ status })
        .eq('id', id)
        .select(BOOK_SELECT_FALLBACK)
        .single());
    }

    if (error) throw error;
    return data;
  },

  async findApprovedSnapshot(bookId) {
    const { data, error } = await supabaseAdmin
      .from('book_approved_snapshots')
      .select('snapshot')
      .eq('book_id', bookId)
      .maybeSingle();

    if (error) {
      if (error.message?.includes('book_approved_snapshots')) return null;
      logger.error('findApprovedSnapshot', { bookId, error: error.message });
      return null;
    }
    return data?.snapshot ?? null;
  },

  async saveApprovedSnapshot(bookId, snapshot) {
    const { error } = await supabaseAdmin.from('book_approved_snapshots').upsert({
      book_id: bookId,
      snapshot,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      logger.warn('saveApprovedSnapshot skipped', { bookId, error: error.message });
    }
  },

  async setSubmissionPrevious(bookId, snapshot) {
    if (!useExtendedColumns) return;

    const { error } = await supabaseAdmin
      .from('books')
      .update({ submission_previous: snapshot })
      .eq('id', bookId);

    if (error && stripMissingColumnError(error)) return;
    if (error) logger.warn('setSubmissionPrevious', { bookId, error: error.message });
  },

  async findGenresByIds(genreIds) {
    if (!genreIds.length) return [];
    const { data, error } = await supabaseAdmin
      .from('genres')
      .select('id, name, slug')
      .in('id', genreIds);

    if (error) return [];
    return data ?? [];
  },

  async findUsersByIds(userIds) {
    if (!userIds.length) return [];
    let { data, error } = await supabaseAdmin
      .from('users')
      .select('id, email, role, created_at')
      .in('id', userIds);

    if (error) {
      ({ data, error } = await supabaseAdmin
        .from('users')
        .select('id, email, role')
        .in('id', userIds));
    }

    if (error) return [];
    return data ?? [];
  },

  async findAuthorProfilesByIds(userIds) {
    if (!userIds.length) return [];
    const { data, error } = await supabaseAdmin
      .from('author_profiles')
      .select('user_id, pen_name, full_name, avatar_url, bio, created_at')
      .in('user_id', userIds);

    if (error) return [];
    return data ?? [];
  },

  async countFormatsByBookIds(bookIds) {
    if (!bookIds.length) return {};
    const { data, error } = await supabaseAdmin
      .from('book_formats')
      .select('book_id')
      .in('book_id', bookIds);

    if (error) return {};
    const counts = {};
    for (const row of data ?? []) {
      counts[row.book_id] = (counts[row.book_id] || 0) + 1;
    }
    return counts;
  },

  async findFormatsByBookId(bookId) {
    const { data, error } = await supabaseAdmin
      .from('book_formats')
      .select(
        'id, format_type, price, currency, storage_path, file_url, mime_type, file_size_bytes, page_count, duration_sec, created_at, updated_at',
      )
      .eq('book_id', bookId);

    if (error) return [];
    return data ?? [];
  },

  async applyBookFieldsFromSnapshot(bookId, snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    const updates = {};
    const scalarFields = [
      'title',
      'subtitle',
      'description',
      'isbn',
      'author_name',
      'publisher_name',
      'language',
      'publication_date',
      'cover_image_url',
      'cover_image_path',
    ];
    for (const field of scalarFields) {
      if (snapshot[field] !== undefined && snapshot[field] !== null && snapshot[field] !== '') {
        updates[field] = snapshot[field];
      }
    }
    if (snapshot.genre_id) {
      updates.genre_id = snapshot.genre_id;
    }
    if (Object.keys(updates).length === 0) return;

    const { error } = await supabaseAdmin.from('books').update(updates).eq('id', bookId);
    if (error) {
      logger.warn('applyBookFieldsFromSnapshot', { bookId, error: error.message });
      throw error;
    }
  },

  async applyFormatPricesFromSnapshot(bookId, formatsSnapshot) {
    if (!Array.isArray(formatsSnapshot) || formatsSnapshot.length === 0) return;
    const existing = await this.findFormatsByBookId(bookId);
    for (const proposed of formatsSnapshot) {
      const formatType = proposed.format_type || proposed.formatType;
      if (!formatType) continue;
      const row = existing.find((f) => f.format_type === formatType);
      if (!row?.id) continue;
      const price = proposed.price != null ? Number(proposed.price) : row.price;
      const currency = proposed.currency || row.currency || 'ETB';
      const { error } = await supabaseAdmin
        .from('book_formats')
        .update({ price, currency })
        .eq('id', row.id);
      if (error) {
        logger.warn('applyFormatPricesFromSnapshot', { bookId, formatType, error: error.message });
      }
    }
  },

  async logActivity(bookId, adminId, action, details = null) {
    const { recordAdminTask } = await import('../utils/adminTaskLogger.js');
    const { formatTaskDescription } = await import('../utils/adminTaskDescriptions.js');

    const description = formatTaskDescription(action, details);
    const enrichedDetails =
      details && typeof details === 'object'
        ? { ...details, description }
        : { description };

    const { error } = await supabaseAdmin.from('book_review_activity').insert({
      book_id: bookId,
      admin_id: adminId,
      action,
      details: enrichedDetails,
    });
    if (error) {
      logger.warn('logActivity skipped', { bookId, error: error.message });
    } else {
      await recordAdminTask({
        adminId,
        category: 'books',
        action,
        bookId,
        details: enrichedDetails,
        description,
      });
    }
  },

  async getActivityForBook(bookId) {
    const { data, error } = await supabaseAdmin
      .from('book_review_activity')
      .select('id, action, details, created_at, admin_id')
      .eq('book_id', bookId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) return [];
    return data ?? [];
  },

  async updateBookReview(id, { status, adminId, reviewNote = null, reviewMetadata = null }) {
    const updates = {
      status,
      reviewed_by_admin_id: adminId,
      reviewed_at: new Date().toISOString(),
    };

    if (useExtendedColumns && reviewNote !== undefined) {
      updates.review_note = reviewNote;
    }
    if (useExtendedColumns && reviewMetadata !== undefined) {
      updates.review_metadata = reviewMetadata;
    }

    const cols = await selectBooks();
    let { data, error } = await supabaseAdmin
      .from('books')
      .update(updates)
      .eq('id', id)
      .select(cols)
      .single();

    if (error) {
      const msg = error.message || '';
      if (msg.includes('review_metadata') && updates.review_metadata !== undefined) {
        delete updates.review_metadata;
        ({ data, error } = await supabaseAdmin
          .from('books')
          .update(updates)
          .eq('id', id)
          .select(await selectBooks())
          .single());
      } else if (stripMissingColumnError(error)) {
        delete updates.review_note;
        delete updates.review_metadata;
        ({ data, error } = await supabaseAdmin
          .from('books')
          .update(updates)
          .eq('id', id)
          .select(BOOK_SELECT_FALLBACK)
          .single());
      }
    }

    if (error) throw error;
    return data;
  },

  /** Persist review text when a combined update drops extended columns. */
  async saveBookReviewFields(bookId, adminId, { reviewNote, reviewMetadata }) {
    const reviewed = {
      reviewed_by_admin_id: adminId,
      reviewed_at: new Date().toISOString(),
    };

    if (reviewNote != null && reviewNote !== '' && useExtendedColumns) {
      const { error } = await supabaseAdmin
        .from('books')
        .update({ ...reviewed, review_note: reviewNote })
        .eq('id', bookId);

      if (error?.message?.includes('review_note')) {
        useExtendedColumns = false;
      } else if (error) {
        logger.warn('saveBookReviewFields review_note', { bookId, error: error.message });
      }
    }

    if (reviewMetadata != null) {
      const { error } = await supabaseAdmin
        .from('books')
        .update({ review_metadata: reviewMetadata })
        .eq('id', bookId);

      if (error && !error.message?.includes('review_metadata')) {
        logger.warn('saveBookReviewFields review_metadata', {
          bookId,
          error: error.message,
        });
      }
    }
  },

  async clearSubmissionPrevious(bookId) {
    if (!useExtendedColumns) return;

    const { error } = await supabaseAdmin
      .from('books')
      .update({ submission_previous: null })
      .eq('id', bookId);

    if (error && !stripMissingColumnError(error)) {
      logger.warn('clearSubmissionPrevious', { bookId, error: error.message });
    }
  },

  async createAuthorMessage({
    recipientUserId,
    bookId,
    adminId,
    subject,
    body,
  }) {
    const { data, error } = await supabaseAdmin
      .from('author_messages')
      .insert({
        recipient_user_id: recipientUserId,
        book_id: bookId,
        sender_admin_id: adminId,
        message_type: 'book_review',
        subject,
        body,
      })
      .select('id, created_at')
      .single();

    if (error) {
      logger.error('createAuthorMessage', { error: error.message });
      return { message: null, error: error.message };
    }
    return { message: data, error: null };
  },

  async getAuthorSubmissionTimeline(userId) {
    const { data: books, error } = await supabaseAdmin
      .from('books')
      .select(
        'id, title, status, genre_id, updated_at, created_at, reviewed_at, review_note, review_metadata, submission_previous',
      )
      .or(`uploaded_by.eq.${userId},author_user_id.eq.${userId}`)
      .order('updated_at', { ascending: false })
      .limit(100);

    if (error) {
      if (error.message?.includes('review_metadata') || error.message?.includes('submission_previous')) {
        const fallback = await supabaseAdmin
          .from('books')
          .select('id, title, status, updated_at, created_at, reviewed_at, review_note')
          .or(`uploaded_by.eq.${userId},author_user_id.eq.${userId}`)
          .order('updated_at', { ascending: false })
          .limit(100);
        return fallback.data ?? [];
      }
      throw error;
    }

    return books ?? [];
  },

  async submitBookForReview(id, userId, { updateNote = '' } = {}) {
    const cols = await selectBooks();
    let { data: existing, error: fetchError } = await supabaseAdmin
      .from('books')
      .select(cols)
      .eq('id', id)
      .single();

    if (fetchError && stripMissingColumnError(fetchError)) {
      ({ data: existing, error: fetchError } = await supabaseAdmin
        .from('books')
        .select(BOOK_SELECT_FALLBACK)
        .eq('id', id)
        .single());
    }

    if (fetchError || !existing) {
      return { book: null, error: fetchError?.message || 'Book not found' };
    }

    if (existing.uploaded_by !== userId) {
      return { book: null, error: 'Not authorized to submit this book' };
    }

    const isApprovedResubmit = existing.status === 'approved';

    if (!['draft', 'rejected', 'approved'].includes(existing.status)) {
      return {
        book: null,
        error: `Cannot submit book with status "${existing.status}"`,
      };
    }

    const approvedSnapshot = await this.findApprovedSnapshot(id);
    const genres = await this.findGenresByIds([existing.genre_id].filter(Boolean));
    const genreName = genres[0]?.name ?? null;

    const formats = await this.findFormatsByBookId(id);
    const proposedSnapshot = buildBookSnapshot(existing, genreName, formats);
    const proposedFormats = formatsToSnapshot(formats);

    if (approvedSnapshot) {
      await this.setSubmissionPrevious(id, approvedSnapshot);
    } else if (existing.reviewed_by_admin_id) {
      await this.setSubmissionPrevious(id, proposedSnapshot);
    }

    const previousSnapshot =
      approvedSnapshot ||
      (existing.reviewed_by_admin_id ? proposedSnapshot : null);
    const previousFormats =
      approvedSnapshot?.formats || (isApprovedResubmit ? proposedFormats : null);

    if (isApprovedResubmit || approvedSnapshot) {
      await bookReviewWorkflowRepository.createUpdateRequest({
        book_id: id,
        status: 'pending_review',
        proposed_snapshot: proposedSnapshot,
        previous_snapshot: previousSnapshot,
        proposed_formats: proposedFormats,
        previous_formats: previousFormats,
        update_note: (updateNote || '').trim() || null,
        submitted_by: userId,
      });
    }

    const note = (updateNote || '').trim();
    const submissionMeta = {
      title: existing.title,
      updateNote: note || null,
      submittedAt: new Date().toISOString(),
      submissionKind:
        isApprovedResubmit || approvedSnapshot || existing.reviewed_by_admin_id
          ? 'metadata_update'
          : 'new_entry',
    };

    const updates = { status: 'pending_review' };
    if (useExtendedColumns) {
      updates.review_metadata = submissionMeta;
    }

    let { data, error } = await supabaseAdmin
      .from('books')
      .update(updates)
      .eq('id', id)
      .select(cols)
      .single();

    if (error && stripMissingColumnError(error)) {
      ({ data, error } = await supabaseAdmin
        .from('books')
        .update({ status: 'pending_review' })
        .eq('id', id)
        .select(BOOK_SELECT_FALLBACK)
        .single());
    }

    if (error) {
      return { book: null, error: error.message };
    }

    await this.logActivity(id, userId, 'submitted_for_review', submissionMeta);

    return { book: data, error: null };
  },
};
