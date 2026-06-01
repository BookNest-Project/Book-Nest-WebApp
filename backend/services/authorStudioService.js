import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';
import { adminApprovalRepository } from '../repositories/adminApprovalRepository.js';
import {
  bookReviewWorkflowRepository,
  mapFormatRow,
} from '../repositories/bookReviewWorkflowRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import {
  buildBookSnapshot,
  computeFieldChanges,
} from '../utils/bookSnapshot.js';
import {
  DEFAULT_REVENUE_AGREEMENT_VERSION,
  DEFAULT_AUTHOR_REVENUE_SHARE,
} from '../utils/bookReviewConstants.js';
import { sendRevenueAgreementSignedEmail } from './rejectionEmail.js';
import { adminNotificationService } from './adminNotificationService.js';
import { supabaseAdmin } from '../config/supabase.js';

const STUDIO_APP_URL = process.env.STUDIO_APP_URL || process.env.APP_URL || 'http://localhost:3000';

const AGREEMENT_TEXT = `BookNest Author Revenue Agreement (v${DEFAULT_REVENUE_AGREEMENT_VERSION})

By signing, you agree that:
• Your share of net sales revenue is ${Math.round(DEFAULT_AUTHOR_REVENUE_SHARE * 100)}%; BookNest retains the platform share.
• You grant BookNest the right to distribute approved digital formats (PDF and/or Audio) in the marketplace.
• Submitted content is original or properly licensed, and you accept admin review before publication.
• Updates to approved books require a new admin review; prior approved versions remain live until an update is approved.

This agreement applies to all books you submit for review on BookNest.`;

function parseMeta(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || null;
}

async function findPendingBooksForAuthor(userId) {
  const { data, error } = await supabaseAdmin
    .from('books')
    .select('id, title')
    .eq('status', 'pending_review')
    .or(`author_user_id.eq.${userId},uploaded_by.eq.${userId}`);

  if (error) return [];
  return data ?? [];
}

async function notifyAgreementSigned(userId, status, signedName) {
  const subject = 'Revenue agreement signed successfully';
  const body = [
    `You signed the BookNest Author Revenue Agreement (v${status.version}).`,
    `Signed as: ${signedName}`,
    `Your share: ${status.authorSharePercent}% · Platform: ${status.platformSharePercent}%`,
    '',
    'You may now submit books for admin review from Studio.',
  ].join('\n');

  const msgResult = await adminApprovalRepository.createAuthorMessage({
    recipientUserId: userId,
    bookId: null,
    adminId: null,
    subject,
    body,
  });

  let emailSent = false;
  if (status.authorEmail) {
    const mail = await sendRevenueAgreementSignedEmail({
      to: status.authorEmail,
      authorName: signedName,
      agreementVersion: status.version,
      authorSharePercent: status.authorSharePercent,
      platformSharePercent: status.platformSharePercent,
      signedAt: status.acceptedAt,
      studioUrl: `${STUDIO_APP_URL}/studio`,
    });
    emailSent = mail.sent;
  }

  const pendingBooks = await findPendingBooksForAuthor(userId);
  await adminNotificationService.notifyAdminsRevenueAgreementSigned({
    authorUserId: userId,
    authorName: signedName,
    authorEmail: status.authorEmail,
    agreementVersion: status.version,
    pendingBooks,
  });

  return {
    inApp: Boolean(msgResult.message),
    email: emailSent,
    adminsNotified: true,
    notified: Boolean(msgResult.message) || emailSent,
  };
}

export const authorStudioService = {
  agreementText: AGREEMENT_TEXT,

  async getRevenueAgreementStatus(userId) {
    const row = await bookReviewWorkflowRepository.findRevenueAgreement(userId);
    const user = await userRepository.findById(userId);
    const profile = await userRepository.findAuthorProfile(userId);

    return {
      signed: Boolean(row),
      version: row?.agreement_version || DEFAULT_REVENUE_AGREEMENT_VERSION,
      acceptedAt: row?.accepted_at || null,
      authorName: row?.author_name || profile?.pen_name || profile?.full_name || null,
      authorEmail: row?.author_email || user?.email || null,
      agreementText: AGREEMENT_TEXT,
      authorSharePercent: Math.round(DEFAULT_AUTHOR_REVENUE_SHARE * 100),
      platformSharePercent: 100 - Math.round(DEFAULT_AUTHOR_REVENUE_SHARE * 100),
    };
  },

  async signRevenueAgreement(userId, req, { accepted, signatureName }) {
    if (!accepted) {
      throw new ValidationError('You must accept the revenue agreement to continue');
    }

    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');
    if (user.role !== 'author' && user.role !== 'publisher') {
      throw new ForbiddenError('Only authors and publishers can sign the revenue agreement');
    }

    const profile =
      user.role === 'author'
        ? await userRepository.findAuthorProfile(userId)
        : await userRepository.findPublisherProfile(userId);

    const name =
      (signatureName || '').trim() ||
      profile?.pen_name ||
      profile?.full_name ||
      profile?.company_name ||
      'Author';

    const existing = await bookReviewWorkflowRepository.findRevenueAgreement(userId);
    const wasAlreadySigned = Boolean(existing);

    const { error } = await supabaseAdmin.from('author_revenue_agreements').upsert(
      {
        author_user_id: userId,
        agreement_version: DEFAULT_REVENUE_AGREEMENT_VERSION,
        accepted_at: new Date().toISOString(),
        author_name: name,
        author_email: user.email,
        ip_address: clientIp(req),
        signature_data: {
          method: 'electronic',
          signedName: name,
          userAgent: req.headers['user-agent'] || null,
        },
      },
      { onConflict: 'author_user_id,agreement_version' },
    );

    if (error) {
      throw new ValidationError(error.message || 'Failed to save agreement');
    }

    const status = await this.getRevenueAgreementStatus(userId);
    const notification = wasAlreadySigned
      ? { notified: false, skipped: true, reason: 'already_signed' }
      : await notifyAgreementSigned(userId, status, name);

    return { ...status, notification };
  },

  async requireRevenueAgreement(userId) {
    const row = await bookReviewWorkflowRepository.findRevenueAgreement(userId);
    if (!row) {
      throw new ValidationError(
        'Sign the revenue agreement in Author Profile before submitting books for review',
      );
    }
  },

  async getBookSubmission(bookId, userId) {
    const book = await adminApprovalRepository.findBookById(bookId);
    if (!book) throw new NotFoundError('Book');
    if (book.uploaded_by !== userId) {
      throw new ForbiddenError('You do not have access to this book');
    }

    const formatsRaw = await adminApprovalRepository.findFormatsByBookId(bookId);
    const formats = formatsRaw.map(mapFormatRow);
    const genres = await adminApprovalRepository.findGenresByIds([book.genre_id].filter(Boolean));
    const genreName = genres[0]?.name ?? null;

    const meta = parseMeta(book.review_metadata);
    let previous = book.submission_previous;
    if (typeof previous === 'string') {
      try {
        previous = JSON.parse(previous);
      } catch {
        previous = null;
      }
    }
    if (!previous) {
      previous = await adminApprovalRepository.findApprovedSnapshot(bookId);
      if (typeof previous === 'string') {
        try {
          previous = JSON.parse(previous);
        } catch {
          previous = null;
        }
      }
    }

    const proposed = buildBookSnapshot(book, genreName, formatsRaw);
    const isUpdateSubmission =
      book.status === 'pending_review' &&
      (meta.submissionKind === 'metadata_update' ||
        Boolean(previous) ||
        Boolean(book.reviewed_by_admin_id));

    const changes =
      isUpdateSubmission && previous ? computeFieldChanges(previous, proposed) : [];

    const updateRequest = await bookReviewWorkflowRepository.findPendingUpdateRequest(bookId);
    const revenueAgreement = await this.getRevenueAgreementStatus(userId);

    const pdfFormat = formats.find((f) => f.formatType === 'PDF');
    const audioFormat = formats.find((f) => f.formatType === 'Audio');
    const previousFormats = updateRequest?.previous_formats || previous?.formats || [];
    const pdfPrevious = (previousFormats || []).find((f) => f.format_type === 'PDF');
    const audioPrevious = (previousFormats || []).find((f) => f.format_type === 'Audio');

    return {
      id: book.id,
      title: book.title,
      subtitle: book.subtitle,
      description: book.description,
      status: book.status,
      reviewNote: book.review_note,
      language: book.language,
      isbn: book.isbn,
      publicationDate: book.publication_date,
      coverImageUrl: book.cover_image_url,
      genre: genreName,
      submittedAt: book.updated_at,
      createdAt: book.created_at,
      reviewedAt: book.reviewed_at,
      formats,
      isUpdateSubmission,
      updateNote: meta.updateNote || updateRequest?.update_note || null,
      updateRequest: updateRequest
        ? {
            id: updateRequest.id,
            status: updateRequest.status,
            submittedAt: updateRequest.created_at,
            updateNote: updateRequest.update_note,
          }
        : null,
      descriptionComparison: isUpdateSubmission
        ? {
            previous: previous?.description ?? null,
            current: book.description ?? null,
          }
        : null,
      changes,
      contentComparison: isUpdateSubmission
        ? {
            pdf: {
              previous: pdfPrevious ? mapFormatRow({ ...pdfPrevious, format_type: 'PDF' }) : null,
              current: pdfFormat || null,
            },
            audio: {
              previous: audioPrevious ? mapFormatRow({ ...audioPrevious, format_type: 'Audio' }) : null,
              current: audioFormat || null,
            },
          }
        : null,
      revenueAgreement,
      canSubmitForReview: ['draft', 'rejected', 'approved'].includes(book.status),
      mustSignAgreement: !revenueAgreement.signed,
    };
  },
};
