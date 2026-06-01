import { NotFoundError, ValidationError } from '../utils/errors.js';
import { adminApprovalRepository } from '../repositories/adminApprovalRepository.js';
import {
  buildBookSnapshot,
  computeFieldChanges,
  formatsToSnapshot,
} from '../utils/bookSnapshot.js';
import { adminBookReviewService } from './adminBookReviewService.js';
import {
  bookReviewWorkflowRepository,
  mapFormatRow,
  buildFormatSlots,
} from '../repositories/bookReviewWorkflowRepository.js';
import { sendEmail } from './emailService.js';
import { sendBookRejectionEmail, sendBookChangesRequestedEmail } from './rejectionEmail.js';
import { userRepository } from '../repositories/userRepository.js';

async function notifyAuthorAboutReview({
  recipientUserId,
  bookId,
  adminId,
  subject,
  body,
  reviewNote = null,
  rejectionEmail = null,
  changesRequestedEmail = null,
}) {
  if (!recipientUserId) {
    return {
      inApp: false,
      email: false,
      bookNote: false,
      notified: false,
      reason: 'no_recipient',
    };
  }

  const users = await adminApprovalRepository.findUsersByIds([recipientUserId]);
  const authorEmail = users[0]?.email ?? null;

  let bookNote = false;
  if (reviewNote) {
    await adminApprovalRepository.saveBookReviewFields(bookId, adminId, {
      reviewNote,
      reviewMetadata: null,
    });
    const refreshed = await adminApprovalRepository.findBookById(bookId);
    bookNote = Boolean(refreshed?.review_note);
  }

  const msgResult = await adminApprovalRepository.createAuthorMessage({
    recipientUserId,
    bookId,
    adminId,
    subject,
    body,
  });

  let emailSent = false;
  let emailReason = authorEmail ? null : 'no_email';

  if (authorEmail) {
    const mail = rejectionEmail
      ? await sendBookRejectionEmail({ to: authorEmail, ...rejectionEmail })
      : changesRequestedEmail
        ? await sendBookChangesRequestedEmail({ to: authorEmail, ...changesRequestedEmail })
        : await sendEmail({
            to: authorEmail,
            subject,
            text: body,
          });
    emailSent = mail.sent;
    if (!mail.sent) emailReason = mail.reason || 'send_failed';
  }

  const needsSchema =
    msgResult.error?.includes('author_messages') ||
    msgResult.error?.includes('schema cache');

  return {
    inApp: Boolean(msgResult.message),
    inAppError: msgResult.error,
    bookNote,
    email: emailSent,
    emailReason,
    needsSchema,
    notified: Boolean(msgResult.message) || emailSent || bookNote,
  };
}

function parseRejectPayload(payload = {}) {
  const reason =
    typeof payload === 'string' ? payload : payload.reason || payload.review_note || '';
  const trimmed = (reason || '').trim();
  const adminNotes = (payload.adminNotes || payload.admin_notes || '').trim();
  const suggestedFixes = (payload.suggestedFixes || payload.suggested_fixes || '').trim();
  const severity = payload.severity || 'medium';

  return { trimmed, adminNotes, suggestedFixes, severity };
}

function buildReviewMetadata(trimmed, adminNotes, suggestedFixes, severity, adminId) {
  return {
    reason: trimmed,
    adminNotes: adminNotes || null,
    suggestedFixes: suggestedFixes || null,
    severity,
    rejectedAt: new Date().toISOString(),
    rejectedBy: adminId,
  };
}

async function sendRejectionNotification({
  book,
  bookId,
  adminId,
  trimmed,
  adminNotes,
  suggestedFixes,
  severity,
  updated,
}) {
  const recipientId = book.author_user_id || book.uploaded_by;
  if (!recipientId) {
    return { notified: false, reason: 'no_recipient' };
  }

  const messageParts = [
    `Your submission "${book.title}" was rejected.`,
    '',
    `Reason:\n${trimmed}`,
  ];
  if (adminNotes) messageParts.push('', `Admin notes:\n${adminNotes}`);
  if (suggestedFixes) messageParts.push('', `Suggested fixes:\n${suggestedFixes}`);

  const authorProfiles = await adminApprovalRepository.findAuthorProfilesByIds([recipientId]);
  const authorProfile = authorProfiles[0];
  const authorName =
    authorProfile?.full_name ||
    authorProfile?.pen_name ||
    book.author_name ||
    'Author';

  const adminUsers = await adminApprovalRepository.findUsersByIds([adminId]);
  const adminUser = adminUsers[0];
  const adminProfile = await userRepository.findAdminProfile(adminId);
  const reviewerName =
    adminProfile?.display_name || adminUser?.email?.split('@')[0] || 'Moderator';

  return notifyAuthorAboutReview({
    recipientUserId: recipientId,
    bookId,
    adminId,
    subject: `Book rejected: ${book.title}`,
    body: messageParts.join('\n'),
    reviewNote: trimmed,
    rejectionEmail: {
      authorName,
      bookTitle: book.title,
      bookId,
      reason: trimmed,
      adminNotes: adminNotes || null,
      suggestedFixes: suggestedFixes || null,
      severity,
      reviewerName,
      reviewerEmail: adminUser?.email || null,
      reviewedAt: updated?.reviewed_at || new Date().toISOString(),
    },
  });
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

function estimateChapterCount(description, formatCount = 0) {
  if (formatCount > 0) return formatCount;
  if (!description) return 0;
  const blocks = description.split(/\n\s*\n/).filter((p) => p.trim().length > 40);
  return blocks.length || 1;
}

function mapBookToQueueItem(book, genreMap, userMap, formatCounts = {}) {
  const uploader = userMap[book.uploaded_by];
  const authorUser = userMap[book.author_user_id];
  const reviewer = userMap[book.reviewed_by_admin_id];
  const genre = genreMap[book.genre_id];
  const hasPriorReview = Boolean(book.reviewed_by_admin_id || book.submission_previous);
  const isNewEntry = book.status === 'pending_review' && !hasPriorReview;
  const formatCount = formatCounts[book.id] || 0;
  const reviewMetadata = parseReviewMetadata(book.review_metadata);

  return {
    id: book.id,
    title: book.title,
    subtitle: book.subtitle,
    isbn: book.isbn,
    description: book.description,
    author: {
      id: book.author_user_id || book.uploaded_by,
      publicName: book.author_name,
      email: authorUser?.email || uploader?.email || null,
    },
    reviewedBy: reviewer
      ? {
          id: reviewer.id,
          email: reviewer.email,
        }
      : null,
    formatCount,
    chapterCount: estimateChapterCount(book.description, formatCount),
    isResubmitted:
      book.status === 'pending_review' && hasPriorReview && Boolean(book.review_note),
    reviewMetadata,
    publisherName: book.publisher_name,
    genre: genre?.name || null,
    genreSlug: genre?.slug || null,
    genreId: book.genre_id,
    language: book.language,
    publicationDate: book.publication_date,
    coverImageUrl: book.cover_image_url,
    status: book.status,
    reviewNote: book.review_note || null,
    submissionType: isNewEntry ? 'new_entry' : 'metadata_update',
    type:
      book.status === 'pending_review'
        ? isNewEntry
          ? 'NEW'
          : 'UPDATE'
        : (book.status || '').toUpperCase(),
    submittedAt: book.updated_at || book.created_at,
    createdAt: book.created_at,
    reviewedAt: book.reviewed_at,
    uploadedBy: book.uploaded_by,
    uploaderRole: uploader?.role || null,
    previouslyReviewedAt: book.reviewed_at,
  };
}

async function enrichBooks(books) {
  const genreIds = [...new Set(books.map((b) => b.genre_id).filter(Boolean))];
  const userIds = [
    ...new Set(
      books.flatMap((b) =>
        [b.uploaded_by, b.author_user_id, b.reviewed_by_admin_id].filter(Boolean),
      ),
    ),
  ];
  const bookIds = books.map((b) => b.id);

  const [genres, users, formatCounts] = await Promise.all([
    adminApprovalRepository.findGenresByIds(genreIds),
    adminApprovalRepository.findUsersByIds(userIds),
    adminApprovalRepository.countFormatsByBookIds(bookIds),
  ]);

  const genreMap = Object.fromEntries(genres.map((g) => [g.id, g]));
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  return books.map((book) => mapBookToQueueItem(book, genreMap, userMap, formatCounts));
}

export const adminApprovalService = {
  async getQueueStats() {
    const [
      pending,
      approved,
      rejected,
      resubmitted,
      totalBooks,
      totalAuthors,
      reviewedToday,
    ] = await Promise.all([
      adminApprovalRepository.countByStatus('pending_review'),
      adminApprovalRepository.countByStatus('approved'),
      adminApprovalRepository.countByStatus('rejected'),
      adminApprovalRepository.countResubmitted(),
      adminApprovalRepository.countAllBooks(),
      adminApprovalRepository.countAuthors(),
      adminApprovalRepository.countReviewedToday(),
    ]);

    return {
      pending,
      approved,
      rejected,
      resubmitted,
      totalBooks,
      totalAuthors,
      reviewedToday,
    };
  },

  async listBooks({
    status = 'pending_review',
    page = 1,
    limit = 20,
    search = '',
    type = 'all',
    sort = 'newest',
  }) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    let submissionType = null;
    if (type === 'new_entry' || type === 'new') submissionType = 'new_entry';
    if (type === 'metadata_update' || type === 'update') submissionType = 'metadata_update';
    if (type === 'resubmitted') submissionType = 'resubmitted';

    const allowedSort = ['newest', 'oldest', 'title_asc', 'title_desc'];
    const safeSort = allowedSort.includes(sort) ? sort : 'newest';

    const { books, total } = await adminApprovalRepository.findBooksByStatus({
      status,
      page: safePage,
      limit: safeLimit,
      search: search.trim(),
      submissionType,
      sort: safeSort,
    });

    const items = await enrichBooks(books);

    return {
      items,
      status,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit) || 1,
      },
    };
  },

  async getPendingBooks(opts = {}) {
    const {
      page = 1,
      limit = 20,
      search = '',
      type = 'all',
      sort = 'newest',
    } = opts;

    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    let books;
    let total;

    if (type === 'all') {
      ({ books, total } = await adminApprovalRepository.findAllPendingBooks({
        page: safePage,
        limit: safeLimit,
        search: search.trim(),
        sort,
      }));
    } else {
      ({ books, total } = await adminApprovalRepository.findBooksByStatus({
        status: 'pending_review',
        page: safePage,
        limit: safeLimit,
        search: search.trim(),
        submissionType:
          type === 'new_entry'
            ? 'new_entry'
            : type === 'resubmitted'
              ? 'resubmitted'
              : 'metadata_update',
        sort,
      }));
    }

    const items = await enrichBooks(books);

    return {
      items,
      status: 'pending_review',
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit) || 1,
      },
    };
  },

  async getBookDetail(bookId) {
    const book = await adminApprovalRepository.findBookById(bookId);

    if (!book) {
      throw new NotFoundError('Book');
    }

    const genres = await adminApprovalRepository.findGenresByIds([book.genre_id].filter(Boolean));
    const genreName = genres[0]?.name ?? null;
    const users = await adminApprovalRepository.findUsersByIds(
      [book.uploaded_by, book.author_user_id, book.reviewed_by_admin_id].filter(Boolean),
    );

    const formatCounts = await adminApprovalRepository.countFormatsByBookIds([bookId]);
    const authorProfiles = await adminApprovalRepository.findAuthorProfilesByIds(
      [book.author_user_id].filter(Boolean),
    );
    const authorProfile = authorProfiles[0] || null;
    const authorBookCount = await adminApprovalRepository.countAuthorBooks(
      book.author_user_id || book.uploaded_by,
    );

    const genreMap = Object.fromEntries(genres.map((g) => [g.id, g]));
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    const item = mapBookToQueueItem(book, genreMap, userMap, formatCounts);
    const authorUser = userMap[book.author_user_id || book.uploaded_by];
    const reviewer = userMap[book.reviewed_by_admin_id];

    const workflow = await adminBookReviewService.enrichBookDetail(book, item, users);
    const { proposed, previous, changes, formats, ...workflowRest } = workflow;
    const isNewEntry = item.submissionType === 'new_entry';
    const dbActivity = await adminApprovalRepository.getActivityForBook(bookId);

    const activity = [
      {
        id: 'submitted',
        message: 'Submission queued for review',
        at: item.submittedAt,
      },
      ...dbActivity.map((row) => ({
        id: row.id,
        message: row.action.replace(/_/g, ' '),
        at: row.created_at,
        details: row.details,
      })),
      ...(book.review_note && !dbActivity.length
        ? [
            {
              id: 'review-note',
              message: `Prior rejection: ${book.review_note}`,
              at: book.reviewed_at || item.submittedAt,
            },
          ]
        : []),
    ];

    const submissionMeta =
      typeof book.review_metadata === 'object'
        ? book.review_metadata
        : item.reviewMetadata;

    return {
      ...item,
      ...workflowRest,
      dbStatus: book.status,
      formats,
      proposed,
      previous: previous || null,
      changes: isNewEntry ? [] : changes,
      isNewEntry,
      updateNote: submissionMeta?.updateNote || workflowRest.updateRequest?.updateNote || null,
      submissionKind: submissionMeta?.submissionKind || item.submissionType,
      activity,
      authorProfile: {
        name:
          authorProfile?.pen_name ||
          authorProfile?.full_name ||
          book.author_name ||
          'Unknown',
        email: authorUser?.email || null,
        avatarUrl: authorProfile?.avatar_url || null,
        bio: authorProfile?.bio || null,
        memberSince: authorUser?.created_at || authorProfile?.created_at || null,
        publishedBooksCount: authorBookCount,
      },
      stats: {
        views: 0,
        favorites: 0,
        readingTimeMinutes: Math.max(
          1,
          Math.ceil((book.description?.length || 0) / 1200),
        ),
        totalChapters: item.chapterCount,
      },
      approvedBy: reviewer
        ? { id: reviewer.id, email: reviewer.email }
        : item.reviewedBy,
      approvedAt: book.status === 'approved' ? book.reviewed_at : null,
      rejectedAt: book.status === 'rejected' ? book.reviewed_at : null,
      isPublic: book.status === 'approved',
    };
  },

  async approveBook(bookId, adminId, options = {}) {
    const book = await adminApprovalRepository.findBookById(bookId);

    if (!book) throw new NotFoundError('Book');
    if (!['pending_review', 'rejected', 'changes_requested'].includes(book.status)) {
      throw new ValidationError(
        `Book cannot be approved from status "${book.status}". Expected pending_review, changes_requested, or rejected.`,
      );
    }

    const formatsRaw = await adminApprovalRepository.findFormatsByBookId(bookId);
    const formats = formatsRaw.map(mapFormatRow);
    const formatSlots = buildFormatSlots(formats);
    const reviewState = await bookReviewWorkflowRepository.getReviewState(book);
    const authorUserId = book.author_user_id || book.uploaded_by;
    const users = authorUserId
      ? await adminApprovalRepository.findUsersByIds([authorUserId])
      : [];
    const revenueRow = await bookReviewWorkflowRepository.findRevenueAgreementForBook(book);
    const revenueAgreement = adminBookReviewService.mapRevenueAgreement(revenueRow, {
      name: book.author_name,
      email: users[0]?.email,
    });

    if (revenueAgreement.signed) {
      reviewState.checklist = {
        ...reviewState.checklist,
        revenueAgreementSigned: true,
      };
    }

    if (!options.skipValidation) {
      adminBookReviewService.validateApprovalGate({
        formats: [formatSlots.pdf, formatSlots.audio],
        reviewState,
        skipContent: options.skipContent === true,
      });
    }

    if (options.skipValidation || options.approveChanges) {
      await adminBookReviewService.applyProposedChangesOnApproval(bookId);
    }

    const bookLive = (await adminApprovalRepository.findBookById(bookId)) || book;
    const formatsRawLive = await adminApprovalRepository.findFormatsByBookId(bookId);
    const genres = await adminApprovalRepository.findGenresByIds(
      [bookLive.genre_id].filter(Boolean),
    );
    const snapshot = buildBookSnapshot(bookLive, genres[0]?.name ?? null, formatsRawLive);
    snapshot.formats = formatsToSnapshot(formatsRawLive);

    let updated;
    try {
      updated = await adminApprovalRepository.updateBookReview(bookId, {
        status: 'approved',
        adminId,
        reviewNote: undefined,
      });
    } catch {
      updated = await adminApprovalRepository.updateBookStatusSimple(
        bookId,
        'approved',
        adminId,
      );
    }

    try {
      await adminApprovalRepository.saveApprovedSnapshot(bookId, snapshot);
      await adminApprovalRepository.clearSubmissionPrevious(bookId);
    } catch {
      /* optional */
    }

    await adminBookReviewService.approvePendingUpdate(bookId, adminId);
    await adminBookReviewService.recordVersionOnApproval(book, adminId, formatsRaw);

    await bookReviewWorkflowRepository.logAudit({
      bookId,
      adminId,
      action: 'book_approved',
      newValue: { status: 'approved', version: book.version_number },
    });

    await adminApprovalRepository.logActivity(bookId, adminId, 'approved', {
      title: book.title,
      version: book.version_number,
    });

    const recipientId = book.author_user_id || book.uploaded_by;
    const authorNotification = recipientId
      ? await notifyAuthorAboutReview({
          recipientUserId: recipientId,
          bookId,
          adminId,
          subject: `Book approved: ${book.title}`,
          body: `Your submission "${book.title}" has been approved and is now live in the catalog.`,
          reviewNote: `Approved on ${new Date().toLocaleString()}`,
        })
      : { notified: false };

    const publisherId = book.publisher_user_id;
    let publisherNotification = { notified: false };
    if (publisherId) {
      publisherNotification = await notifyAuthorAboutReview({
        recipientUserId: publisherId,
        bookId,
        adminId,
        subject: `Book approved: ${book.title}`,
        body: `The book "${book.title}" you published has been approved.`,
      });
    }

    return { book: updated, authorNotification, publisherNotification };
  },

  async saveReviewState(bookId, adminId, patch) {
    return adminBookReviewService.saveReviewState(bookId, adminId, patch);
  },

  async reviewContent(bookId, adminId, payload) {
    return adminBookReviewService.reviewContent(bookId, adminId, payload);
  },

  async requestChanges(bookId, adminId, payload = {}) {
    const feedback = payload.feedback || payload.reason || '';
    const result = await adminBookReviewService.requestChanges(bookId, adminId, feedback);

    const book = await adminApprovalRepository.findBookById(bookId);
    const authorUserId = result.recipientId;
    const users = authorUserId
      ? await adminApprovalRepository.findUsersByIds([authorUserId, adminId].filter(Boolean))
      : [];
    const authorUser = users.find((u) => u.id === authorUserId);
    const adminUser = users.find((u) => u.id === adminId);

    const changesRequestedEmail = {
      authorName: book?.author_name || authorUser?.full_name,
      bookTitle: book?.title || 'Your book',
      bookId,
      feedback: feedback.trim(),
      reviewerName: adminUser?.full_name || adminUser?.email,
      reviewerEmail: adminUser?.email,
      requestedAt: new Date().toISOString(),
    };

    let authorNotification = { notified: false };
    if (result.recipientId) {
      authorNotification = await notifyAuthorAboutReview({
        recipientUserId: result.recipientId,
        bookId,
        adminId,
        subject: result.subject,
        body: result.body,
        reviewNote: feedback.trim(),
        changesRequestedEmail,
      });
    }

    const publisherId = book?.publisher_user_id;
    let publisherNotification = { notified: false };
    if (publisherId) {
      publisherNotification = await notifyAuthorAboutReview({
        recipientUserId: publisherId,
        bookId,
        adminId,
        subject: result.subject,
        body: result.body,
        changesRequestedEmail,
      });
    }

    return { book: result.book, authorNotification, publisherNotification };
  },

  async rejectBook(bookId, adminId, payload = {}, options = {}) {
    const { trimmed, adminNotes, suggestedFixes, severity } = parseRejectPayload(payload);
    if (trimmed.length < 5) {
      throw new ValidationError('Rejection reason must be at least 5 characters');
    }

    const notify =
      options.notify ??
      (typeof payload === 'object' && payload != null ? payload.notify : undefined) ??
      false;

    const book = await adminApprovalRepository.findBookById(bookId);

    if (!book) throw new NotFoundError('Book');
    if (!['pending_review', 'approved'].includes(book.status)) {
      throw new ValidationError(
        `Book cannot be rejected from status "${book.status}". Expected pending_review or approved.`,
      );
    }

    const reviewMetadata = buildReviewMetadata(
      trimmed,
      adminNotes,
      suggestedFixes,
      severity,
      adminId,
    );

    let updated = await adminApprovalRepository.updateBookStatusSimple(
      bookId,
      'rejected',
      adminId,
    );

    try {
      updated = await adminApprovalRepository.updateBookReview(bookId, {
        status: 'rejected',
        adminId,
        reviewNote: trimmed,
        reviewMetadata,
      });
    } catch {
      await adminApprovalRepository.saveBookReviewFields(bookId, adminId, {
        reviewNote: trimmed,
        reviewMetadata,
      });
      updated = (await adminApprovalRepository.findBookById(bookId)) || updated;
    }

    await adminApprovalRepository.logActivity(bookId, adminId, 'rejected', reviewMetadata);

    await bookReviewWorkflowRepository.logAudit({
      bookId,
      adminId,
      action: 'book_rejected',
      newValue: reviewMetadata,
      comments: trimmed,
    });

    const updateRequest = await bookReviewWorkflowRepository.findPendingUpdateRequest(bookId);
    if (updateRequest) {
      await bookReviewWorkflowRepository.resolveUpdateRequest(updateRequest.id, {
        status: 'rejected',
        reviewed_by_admin_id: adminId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: trimmed,
      });
      await bookReviewWorkflowRepository.insertVersion({
        book_id: bookId,
        version_label: book.version_number || '1.0',
        status: 'rejected',
        snapshot: updateRequest.proposed_snapshot,
        formats_snapshot: updateRequest.proposed_formats,
        rejected_by_admin_id: adminId,
        rejection_reason: trimmed,
      });
    }

    let authorNotification = { notified: false, skipped: !notify };
    if (notify) {
      authorNotification = await sendRejectionNotification({
        book,
        bookId,
        adminId,
        trimmed,
        adminNotes,
        suggestedFixes,
        severity,
        updated,
      });
    }

    return { book: updated, reviewNote: trimmed, reviewMetadata, authorNotification };
  },

  async notifyAuthorAboutRejection(bookId, adminId, payload = {}) {
    const book = await adminApprovalRepository.findBookById(bookId);
    if (!book) throw new NotFoundError('Book');
    if (book.status !== 'rejected') {
      throw new ValidationError(
        'Book must be rejected before notifying the author. Click Reject first.',
      );
    }

    const existingMeta = parseReviewMetadata(book.review_metadata);
    const parsed = parseRejectPayload({
      reason: payload.reason || existingMeta?.reason || book.review_note || '',
      adminNotes: payload.adminNotes ?? existingMeta?.adminNotes ?? '',
      suggestedFixes: payload.suggestedFixes ?? existingMeta?.suggestedFixes ?? '',
      severity: payload.severity || existingMeta?.severity || 'medium',
    });

    if (parsed.trimmed.length < 5) {
      throw new ValidationError('Rejection reason must be at least 5 characters');
    }

    const reviewMetadata = buildReviewMetadata(
      parsed.trimmed,
      parsed.adminNotes,
      parsed.suggestedFixes,
      parsed.severity,
      adminId,
    );

    await adminApprovalRepository.saveBookReviewFields(bookId, adminId, {
      reviewNote: parsed.trimmed,
      reviewMetadata,
    });

    const authorNotification = await sendRejectionNotification({
      book,
      bookId,
      adminId,
      trimmed: parsed.trimmed,
      adminNotes: parsed.adminNotes,
      suggestedFixes: parsed.suggestedFixes,
      severity: parsed.severity,
      updated: book,
    });

    return { book, reviewNote: parsed.trimmed, reviewMetadata, authorNotification };
  },

  async revertApproval(bookId, adminId) {
    const book = await adminApprovalRepository.findBookById(bookId);
    if (!book) throw new NotFoundError('Book');
    if (book.status !== 'approved') {
      throw new ValidationError('Only approved books can be reverted');
    }

    let updated;
    try {
      updated = await adminApprovalRepository.updateBookReview(bookId, {
        status: 'pending_review',
        adminId,
        reviewNote: 'Approval removed by admin — returned to queue',
      });
    } catch {
      updated = await adminApprovalRepository.updateBookStatusSimple(
        bookId,
        'pending_review',
        adminId,
      );
    }

    await adminApprovalRepository.logActivity(bookId, adminId, 'approval_removed', {
      title: book.title,
      note: 'Approval removed by admin — returned to queue',
    });
    return updated;
  },

  async reviewBook(bookId, status, adminId, reviewNote) {
    if (status === 'approved') {
      return this.approveBook(bookId, adminId);
    }
    if (status === 'rejected') {
      return this.rejectBook(bookId, adminId, reviewNote || 'Rejected by admin');
    }

    const book = await adminApprovalRepository.findBookById(bookId);
    if (!book) throw new NotFoundError('Book');

    return adminApprovalRepository.updateBookReview(bookId, {
      status,
      adminId,
      reviewNote: reviewNote || null,
    });
  },
};
