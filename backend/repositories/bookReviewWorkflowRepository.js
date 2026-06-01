import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { DEFAULT_REVIEW_STATE } from '../utils/bookReviewConstants.js';
import { resolveFormatFileUrl } from '../utils/formatFileUrl.js';
import { bookReviewStateFileRepository } from './bookReviewStateFileRepository.js';

function tableMissing(error, table) {
  return error?.message?.includes(table) || error?.message?.includes('schema cache');
}

function parseReviewMetadata(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function mergeReviewState(raw, metaState) {
  const base =
    raw && typeof raw === 'object' && Object.keys(raw).length > 0
      ? raw
      : metaState && typeof metaState === 'object'
        ? metaState
        : null;
  if (!base) return { ...DEFAULT_REVIEW_STATE };
  return {
    ...DEFAULT_REVIEW_STATE,
    ...base,
    checklist: {
      ...DEFAULT_REVIEW_STATE.checklist,
      ...(base.checklist || {}),
    },
    pdfReview: { ...DEFAULT_REVIEW_STATE.pdfReview, ...(base.pdfReview || {}) },
    audioReview: { ...DEFAULT_REVIEW_STATE.audioReview, ...(base.audioReview || {}) },
    changeDecisions: {
      ...DEFAULT_REVIEW_STATE.changeDecisions,
      ...(base.changeDecisions || {}),
    },
  };
}

export function fileNameFromStoragePath(storagePath) {
  if (!storagePath) return null;
  const parts = String(storagePath).split('/');
  return parts[parts.length - 1] || storagePath;
}

export function mapFormatRow(row) {
  if (!row) return null;
  const fileUrl = resolveFormatFileUrl(row);
  return {
    id: row.id,
    formatType: row.format_type || row.formatType,
    price: Number(row.price ?? 0),
    currency: row.currency || 'ETB',
    fileUrl,
    storagePath: row.storage_path || row.storagePath || null,
    fileName: fileNameFromStoragePath(row.storage_path || row.storagePath),
    mimeType: row.mime_type || row.mimeType || null,
    fileSizeBytes: row.file_size_bytes ?? row.fileSizeBytes ?? null,
    pageCount: row.page_count ?? row.pageCount ?? null,
    durationSec: row.duration_sec ?? row.durationSec ?? null,
    uploadedAt: row.created_at || row.updated_at || row.uploadedAt || null,
    hasContent: Boolean(fileUrl),
    missing: false,
  };
}

export function emptyFormatSlot(formatType) {
  return {
    id: null,
    formatType,
    price: null,
    currency: 'ETB',
    fileUrl: null,
    storagePath: null,
    fileName: null,
    mimeType: null,
    fileSizeBytes: null,
    pageCount: null,
    durationSec: null,
    uploadedAt: null,
    hasContent: false,
    missing: true,
  };
}

export function buildFormatSlots(formats = []) {
  const pdf = formats.find((f) => f.formatType === 'PDF') || emptyFormatSlot('PDF');
  const audio = formats.find((f) => f.formatType === 'Audio') || emptyFormatSlot('Audio');
  return { pdf, audio };
}

export const bookReviewWorkflowRepository = {
  async findRevenueAgreement(authorUserId) {
    if (!authorUserId) return null;
    const { data, error } = await supabaseAdmin
      .from('author_revenue_agreements')
      .select(
        'id, agreement_version, accepted_at, author_name, author_email, ip_address, signature_data',
      )
      .eq('author_user_id', authorUserId)
      .order('accepted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (tableMissing(error, 'author_revenue_agreements')) return null;
      logger.warn('findRevenueAgreement', { error: error.message });
      return null;
    }
    return data;
  },

  /** Resolve agreement for a book — tries author, uploader, and publisher user ids. */
  async findRevenueAgreementForBook(book) {
    if (!book) return null;
    const candidateIds = [
      book.author_user_id,
      book.uploaded_by,
      book.publisher_user_id,
    ].filter(Boolean);
    const uniqueIds = [...new Set(candidateIds)];
    for (const userId of uniqueIds) {
      const row = await this.findRevenueAgreement(userId);
      if (row) return row;
    }
    return null;
  },

  async getReviewState(book) {
    const meta = parseReviewMetadata(book?.review_metadata);
    let state = mergeReviewState(book?.review_state, meta?.reviewState);

    if (book?.id) {
      try {
        const fileState = await bookReviewStateFileRepository.get(book.id);
        if (fileState && typeof fileState === 'object') {
          state = {
            ...state,
            ...fileState,
            checklist: { ...state.checklist, ...(fileState.checklist || {}) },
            pdfReview: { ...state.pdfReview, ...(fileState.pdfReview || {}) },
            audioReview: { ...state.audioReview, ...(fileState.audioReview || {}) },
            changeDecisions: {
              ...state.changeDecisions,
              ...(fileState.changeDecisions || {}),
            },
          };
        }
      } catch (err) {
        logger.warn('getReviewState file fallback read failed', { bookId: book.id, error: err.message });
      }
    }

    return state;
  },

  async saveReviewStateViaMetadata(bookId, reviewState) {
    const { data: row, error: readErr } = await supabaseAdmin
      .from('books')
      .select('review_metadata')
      .eq('id', bookId)
      .maybeSingle();

    if (readErr && !tableMissing(readErr, 'review_metadata')) {
      throw readErr;
    }

    const meta = parseReviewMetadata(row?.review_metadata) || {};
    meta.reviewState = reviewState;

    const { error } = await supabaseAdmin
      .from('books')
      .update({ review_metadata: meta })
      .eq('id', bookId);

    if (error) {
      if (tableMissing(error, 'review_metadata')) {
        return { saved: false, reviewState };
      }
      throw error;
    }
    return { saved: true, reviewState, viaMetadata: true };
  },

  async saveReviewStateToFile(bookId, reviewState) {
    await bookReviewStateFileRepository.save(bookId, reviewState);
    logger.warn(
      'Review state saved to local file (backend/data/book-review-state.json). Run scripts/admin-book-review-workflow.sql in Supabase for permanent DB storage.',
      { bookId },
    );
    return { saved: true, reviewState, viaFile: true };
  },

  async saveReviewState(bookId, reviewState) {
    const { data, error } = await supabaseAdmin
      .from('books')
      .update({ review_state: reviewState })
      .eq('id', bookId)
      .select('id, review_state')
      .single();

    if (!error) {
      try {
        await bookReviewStateFileRepository.save(bookId, reviewState);
      } catch {
        /* optional mirror */
      }
      return {
        saved: true,
        reviewState: mergeReviewState(data?.review_state, null),
      };
    }

    if (!tableMissing(error, 'review_state')) {
      throw error;
    }

    const viaMeta = await this.saveReviewStateViaMetadata(bookId, reviewState);
    if (viaMeta.saved) {
      try {
        await bookReviewStateFileRepository.save(bookId, reviewState);
      } catch {
        /* optional mirror */
      }
      return viaMeta;
    }

    return this.saveReviewStateToFile(bookId, reviewState);
  },

  async findPendingUpdateRequest(bookId) {
    const { data, error } = await supabaseAdmin
      .from('book_update_requests')
      .select('*')
      .eq('book_id', bookId)
      .eq('status', 'pending_review')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (tableMissing(error, 'book_update_requests')) return null;
      throw error;
    }
    return data;
  },

  async createUpdateRequest(payload) {
    const { data, error } = await supabaseAdmin
      .from('book_update_requests')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      if (tableMissing(error, 'book_update_requests')) {
        return { request: null, error: error.message };
      }
      throw error;
    }
    return { request: data, error: null };
  },

  async resolveUpdateRequest(requestId, updates) {
    const { data, error } = await supabaseAdmin
      .from('book_update_requests')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', requestId)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  async listVersions(bookId, limit = 20) {
    const { data, error } = await supabaseAdmin
      .from('book_versions')
      .select(
        'id, version_label, status, snapshot, formats_snapshot, approved_by_admin_id, rejected_by_admin_id, rejection_reason, created_at',
      )
      .eq('book_id', bookId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      if (tableMissing(error, 'book_versions')) return [];
      throw error;
    }
    return data ?? [];
  },

  async insertVersion(payload) {
    const { data, error } = await supabaseAdmin
      .from('book_versions')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      if (tableMissing(error, 'book_versions')) {
        return { version: null, error: error.message };
      }
      throw error;
    }
    return { version: data, error: null };
  },

  async bumpVersionNumber(bookId, currentLabel) {
    const match = String(currentLabel || '1.0').match(/^(\d+)\.(\d+)$/);
    const next =
      match != null
        ? `${match[1]}.${Number(match[2]) + 1}`
        : `${currentLabel || '1'}.1`;

    const { error } = await supabaseAdmin
      .from('books')
      .update({ version_number: next })
      .eq('id', bookId);

    if (error && !tableMissing(error, 'version_number')) {
      logger.warn('bumpVersionNumber', { bookId, error: error.message });
    }
    return next;
  },

  async logAudit({ bookId, adminId, action, oldValue = null, newValue = null, comments = null }) {
    const { error } = await supabaseAdmin.from('book_review_audit').insert({
      book_id: bookId,
      admin_id: adminId,
      action,
      old_value: oldValue,
      new_value: newValue,
      comments,
    });

    if (error) {
      if (tableMissing(error, 'book_review_audit')) {
        logger.warn('logAudit skipped', { bookId, action });
        return;
      }
      logger.warn('logAudit', { error: error.message });
    }
  },

  async listAudit(bookId, limit = 50) {
    const { data, error } = await supabaseAdmin
      .from('book_review_audit')
      .select('id, admin_id, action, old_value, new_value, comments, created_at')
      .eq('book_id', bookId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      if (tableMissing(error, 'book_review_audit')) return [];
      throw error;
    }
    return data ?? [];
  },
};
