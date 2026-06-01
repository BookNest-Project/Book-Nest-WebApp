import { NotFoundError, ValidationError } from '../utils/errors.js';
import { adminApprovalRepository } from '../repositories/adminApprovalRepository.js';
import {
  bookReviewWorkflowRepository,
  mapFormatRow,
  buildFormatSlots,
} from '../repositories/bookReviewWorkflowRepository.js';
import {
  buildBookSnapshot,
  computeFieldChanges,
  formatsToSnapshot,
  pricingFromFormats,
} from '../utils/bookSnapshot.js';
import {
  DEFAULT_AUTHOR_REVENUE_SHARE,
  DEFAULT_PLATFORM_REVENUE_SHARE,
  DEFAULT_REVENUE_AGREEMENT_VERSION,
  MODERATION_CHECKLIST_KEYS,
} from '../utils/bookReviewConstants.js';
import { adminBookContentService } from './adminBookContentService.js';

function bumpVersionLabel(label) {
  const match = String(label || '1.0').match(/^(\d+)\.(\d+)$/);
  return match != null
    ? `${match[1]}.${Number(match[2]) + 1}`
    : `${label || '1'}.1`;
}

function buildPricingBlock(formats, authorShare = DEFAULT_AUTHOR_REVENUE_SHARE) {
  const { pdfPrice, audioPrice, bundlePrice, currency } = pricingFromFormats(formats);
  const platformShare = 1 - authorShare;
  const samplePrice = bundlePrice ?? pdfPrice ?? audioPrice ?? 0;

  return {
    pdfPrice,
    audioPrice,
    bundlePrice,
    currency,
    discountPercent: null,
    discountLabel: null,
    authorRevenueSharePercent: Math.round(authorShare * 100),
    platformSharePercent: Math.round(platformShare * 100),
    estimatedAuthorEarnings: Number((samplePrice * authorShare).toFixed(2)),
    platformEarnings: Number((samplePrice * platformShare).toFixed(2)),
  };
}

function mapRevenueAgreement(row, authorUser) {
  if (!row) {
    return {
      signed: false,
      version: DEFAULT_REVENUE_AGREEMENT_VERSION,
      acceptedAt: null,
      acceptedTime: null,
      authorName: authorUser?.name || null,
      authorEmail: authorUser?.email || null,
      ipAddress: null,
      signature: null,
    };
  }

  const acceptedAt = row.accepted_at;
  return {
    signed: true,
    version: row.agreement_version,
    acceptedAt,
    acceptedTime: acceptedAt,
    authorName: row.author_name,
    authorEmail: row.author_email,
    ipAddress: row.ip_address,
    signature: row.signature_data,
  };
}

function formatHasReviewableContent(fmt) {
  if (!fmt || fmt.missing) return false;
  return Boolean(
    fmt.fileUrl ||
      fmt.playbackUrl ||
      fmt.storagePath ||
      fmt.hasContent,
  );
}

const REVENUE_CHECKLIST_KEYS = ['revenueAgreementSigned', 'pricingReasonable'];

function validateApprovalGate({ formats, reviewState, skipContent }) {
  const errors = [];
  const pdfFmt = formats.find((f) => f.formatType === 'PDF');
  const audioFmt = formats.find((f) => f.formatType === 'Audio');
  const checklist = reviewState?.checklist || {};

  for (const key of REVENUE_CHECKLIST_KEYS) {
    if (!checklist[key]) {
      errors.push('Complete revenue agreement verification checkboxes before approval');
      break;
    }
  }

  if (!skipContent) {
    if (formatHasReviewableContent(pdfFmt) && reviewState?.pdfReview?.status !== 'approved') {
      errors.push('PDF content must be approved before final approval');
    }
    if (formatHasReviewableContent(audioFmt) && reviewState?.audioReview?.status !== 'approved') {
      errors.push('Audio content must be approved before final approval');
    }
  }

  if (errors.length) {
    throw new ValidationError(errors.join('. '));
  }
}

export const adminBookReviewService = {
  buildPricingBlock,
  mapRevenueAgreement,
  validateApprovalGate,

  async enrichBookDetail(book, item, users) {
    const formatsRaw = await adminApprovalRepository.findFormatsByBookId(book.id);
    const formats = adminBookContentService.enrichFormatsForPlayback(
      formatsRaw.map(mapFormatRow),
      book.language,
    );
    const genreName = item.genre;
    const proposed = buildBookSnapshot(book, genreName, formatsRaw);
    const authorUserId = book.author_user_id || book.uploaded_by;
    const authorUser = users.find((u) => u.id === authorUserId);

    let previous =
      book.submission_previous ||
      (await adminApprovalRepository.findApprovedSnapshot(book.id));

    if (typeof previous === 'string') {
      try {
        previous = JSON.parse(previous);
      } catch {
        previous = null;
      }
    }

    const approvedSnap = await adminApprovalRepository.findApprovedSnapshot(book.id);
    if (typeof approvedSnap === 'string') {
      try {
        previous = previous || JSON.parse(approvedSnap);
      } catch {
        /* ignore */
      }
    } else if (approvedSnap && !previous) {
      previous = approvedSnap;
    }

    const isNewEntry = item.submissionType === 'new_entry';
    const changes = previous ? computeFieldChanges(previous, proposed) : [];

    const reviewState = await bookReviewWorkflowRepository.getReviewState(book);
    const revenueRow = await bookReviewWorkflowRepository.findRevenueAgreementForBook(book);
    const revenueAgreement = mapRevenueAgreement(revenueRow, {
      name: item.authorProfile?.name || book.author_name,
      email: authorUser?.email,
    });

    if (revenueAgreement.signed) {
      reviewState.checklist = {
        ...reviewState.checklist,
        revenueAgreementSigned: true,
      };
      try {
        await bookReviewWorkflowRepository.saveReviewState(book.id, reviewState);
      } catch {
        /* review_state column optional */
      }
    }

    const updateRequest = await bookReviewWorkflowRepository.findPendingUpdateRequest(book.id);
    const versionHistory = await bookReviewWorkflowRepository.listVersions(book.id);
    const auditTrail = await bookReviewWorkflowRepository.listAudit(book.id);

    const previousFormats =
      updateRequest?.previous_formats ||
      previous?.formats ||
      (Array.isArray(previous?.formats) ? previous.formats : []);

    const proposedFormats =
      updateRequest?.proposed_formats || formatsToSnapshot(formatsRaw);

    const pdfCurrent = formats.find((f) => f.formatType === 'PDF');
    const audioCurrent = formats.find((f) => f.formatType === 'Audio');
    const pdfPrevious = (previousFormats || []).find((f) => f.format_type === 'PDF');
    const audioPrevious = (previousFormats || []).find((f) => f.format_type === 'Audio');

    const pricing = buildPricingBlock(formatsRaw);
    const formatSlots = adminBookContentService.buildFormatSlotsWithPlayback(
      formats,
      book.language,
    );

    return {
      formats,
      formatSlots,
      proposed,
      previous: previous || null,
      changes: isNewEntry ? [] : changes,
      reviewState,
      revenueAgreement,
      pricing,
      visibility: {
        isPublic: book.status === 'approved',
        marketplaceVisible: book.status === 'approved',
      },
      drm: { enabled: true, label: 'Standard DRM (platform default)' },
      tags: [],
      versionNumber: book.version_number || '1.0',
      updateRequest: updateRequest
        ? {
            id: updateRequest.id,
            status: updateRequest.status,
            updateNote: updateRequest.update_note,
            submittedAt: updateRequest.created_at,
          }
        : null,
      contentComparison: {
        pdf: {
          current: pdfPrevious ? mapFormatRow({ ...pdfPrevious, format_type: 'PDF' }) : null,
          proposed: pdfCurrent,
        },
        audio: {
          current: audioPrevious ? mapFormatRow({ ...audioPrevious, format_type: 'Audio' }) : null,
          proposed: audioCurrent,
        },
      },
      versionHistory: versionHistory.map((v) => ({
        id: v.id,
        version: v.version_label,
        status: v.status,
        at: v.created_at,
        reason: v.rejection_reason,
        approvedByAdminId: v.approved_by_admin_id,
        rejectedByAdminId: v.rejected_by_admin_id,
      })),
      auditTrail: auditTrail.map((a) => ({
        id: a.id,
        adminId: a.admin_id,
        action: a.action,
        oldValue: a.old_value,
        newValue: a.new_value,
        comments: a.comments,
        at: a.created_at,
      })),
    };
  },

  async saveReviewState(bookId, adminId, patch) {
    const book = await adminApprovalRepository.findBookById(bookId);
    if (!book) throw new NotFoundError('Book');

    const current = await bookReviewWorkflowRepository.getReviewState(book);
    const next = {
      ...current,
      ...patch,
      checklist: { ...current.checklist, ...(patch.checklist || {}) },
      pdfReview: { ...current.pdfReview, ...(patch.pdfReview || {}) },
      audioReview: { ...current.audioReview, ...(patch.audioReview || {}) },
      changeDecisions: {
        ...(current.changeDecisions || {}),
        ...(patch.changeDecisions || {}),
      },
    };

    await bookReviewWorkflowRepository.saveReviewState(bookId, next);
    await bookReviewWorkflowRepository.logAudit({
      bookId,
      adminId,
      action: 'review_state_updated',
      oldValue: current,
      newValue: next,
    });
    await adminApprovalRepository.logActivity(bookId, adminId, 'review_state_updated', {
      title: book.title,
      patch,
    });

    const refreshed = await adminApprovalRepository.findBookById(bookId);
    return bookReviewWorkflowRepository.getReviewState(refreshed || book);
  },

  async reviewContent(bookId, adminId, { target, status, comment }) {
    const allowed = ['approved', 'changes_requested', 'rejected', 'pending'];
    if (!['pdf', 'audio'].includes(target)) {
      throw new ValidationError('target must be pdf or audio');
    }
    if (!allowed.includes(status)) {
      throw new ValidationError('Invalid content review status');
    }

    const book = await adminApprovalRepository.findBookById(bookId);
    if (!book) throw new NotFoundError('Book');

    const current = await bookReviewWorkflowRepository.getReviewState(book);
    const key = target === 'pdf' ? 'pdfReview' : 'audioReview';
    const oldReview = current[key];
    const nextReview = {
      status,
      comment: comment || null,
      reviewedAt: new Date().toISOString(),
      reviewedBy: adminId,
    };

    const next = {
      ...current,
      [key]: nextReview,
    };

    await bookReviewWorkflowRepository.saveReviewState(bookId, next);
    await bookReviewWorkflowRepository.logAudit({
      bookId,
      adminId,
      action: `${target}_${status}`,
      oldValue: oldReview,
      newValue: nextReview,
      comments: comment,
    });
    await adminApprovalRepository.logActivity(bookId, adminId, `${target}_review_${status}`, {
      comment,
      title: book.title,
      target,
      status,
    });

    const refreshed = await adminApprovalRepository.findBookById(bookId);
    return bookReviewWorkflowRepository.getReviewState(refreshed || book);
  },

  async requestChanges(bookId, adminId, feedback) {
    const trimmed = (feedback || '').trim();
    if (trimmed.length < 5) {
      throw new ValidationError('Feedback must be at least 5 characters');
    }

    const book = await adminApprovalRepository.findBookById(bookId);
    if (!book) throw new NotFoundError('Book');
    if (!['pending_review', 'changes_requested'].includes(book.status)) {
      throw new ValidationError('Book is not awaiting review');
    }

    let updated;
    try {
      updated = await adminApprovalRepository.updateBookReview(bookId, {
        status: 'changes_requested',
        adminId,
        reviewNote: trimmed,
        reviewMetadata: {
          decision: 'changes_requested',
          feedback: trimmed,
          requestedAt: new Date().toISOString(),
          requestedBy: adminId,
        },
      });
    } catch {
      updated = await adminApprovalRepository.updateBookStatusSimple(
        bookId,
        'changes_requested',
        adminId,
      );
    }

    await bookReviewWorkflowRepository.logAudit({
      bookId,
      adminId,
      action: 'changes_requested',
      comments: trimmed,
    });
    await adminApprovalRepository.logActivity(bookId, adminId, 'changes_requested', {
      feedback: trimmed,
      title: book.title,
    });

    const recipientId = book.author_user_id || book.uploaded_by;
    return {
      book: updated,
      recipientId,
      subject: `Changes requested: ${book.title}`,
      body: `An admin requested changes to "${book.title}".\n\n${trimmed}`,
    };
  },

  async recordVersionOnApproval(book, adminId, formatsRaw) {
    const snapshot = buildBookSnapshot(book, null, formatsRaw);
    snapshot.formats = formatsToSnapshot(formatsRaw);

    await bookReviewWorkflowRepository.insertVersion({
      book_id: book.id,
      version_label: book.version_number || '1.0',
      status: 'approved',
      snapshot,
      formats_snapshot: formatsToSnapshot(formatsRaw),
      approved_by_admin_id: adminId,
    });

    const nextVersion = bumpVersionLabel(book.version_number || '1.0');
    await bookReviewWorkflowRepository.bumpVersionNumber(book.id, book.version_number);
    return nextVersion;
  },

  async applyProposedChangesOnApproval(bookId) {
    const updateRequest = await bookReviewWorkflowRepository.findPendingUpdateRequest(bookId);
    if (!updateRequest?.proposed_snapshot) return false;

    await adminApprovalRepository.applyBookFieldsFromSnapshot(
      bookId,
      updateRequest.proposed_snapshot,
    );
    await adminApprovalRepository.applyFormatPricesFromSnapshot(
      bookId,
      updateRequest.proposed_formats,
    );
    return true;
  },

  async approvePendingUpdate(bookId, adminId) {
    const updateRequest = await bookReviewWorkflowRepository.findPendingUpdateRequest(bookId);
    if (!updateRequest) return null;

    const book = await adminApprovalRepository.findBookById(bookId);
    if (!book) throw new NotFoundError('Book');

    const formatsRaw = await adminApprovalRepository.findFormatsByBookId(bookId);

    if (updateRequest.previous_snapshot) {
      await bookReviewWorkflowRepository.insertVersion({
        book_id: bookId,
        version_label: book.version_number || '1.0',
        status: 'superseded',
        snapshot: updateRequest.previous_snapshot,
        formats_snapshot: updateRequest.previous_formats,
        approved_by_admin_id: null,
      });
    }

    const nextVersion = bumpVersionLabel(book.version_number || '1.0');
    await bookReviewWorkflowRepository.bumpVersionNumber(bookId, book.version_number);

    await bookReviewWorkflowRepository.insertVersion({
      book_id: bookId,
      version_label: nextVersion,
      status: 'approved',
      snapshot: updateRequest.proposed_snapshot,
      formats_snapshot: updateRequest.proposed_formats,
      approved_by_admin_id: adminId,
    });

    await bookReviewWorkflowRepository.resolveUpdateRequest(updateRequest.id, {
      status: 'approved',
      reviewed_by_admin_id: adminId,
      reviewed_at: new Date().toISOString(),
    });

    await bookReviewWorkflowRepository.logAudit({
      bookId,
      adminId,
      action: 'update_approved',
      oldValue: updateRequest.previous_snapshot,
      newValue: updateRequest.proposed_snapshot,
    });
    await adminApprovalRepository.logActivity(bookId, adminId, 'update_approved', {
      title: book.title,
      version: nextVersion,
    });

    return nextVersion;
  },
};
