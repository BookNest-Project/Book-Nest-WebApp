import { supabase } from '../config/supabase.js';
import { formatSuccess } from '../utils/responseFormatter.js';
import { ValidationError, ForbiddenError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { authService } from '../services/authService.js';
import { adminApprovalService } from '../services/adminApprovalService.js';
import { adminNotificationService } from '../services/adminNotificationService.js';
import { validateLogin } from '../validators/userValidator.js';
import { userRepository } from '../repositories/userRepository.js';
import { getAuthCookieOptions } from '../utils/cookieOptions.js';
import { resolveAuthToken } from '../utils/resolveAuthToken.js';

/**
 * POST /api/admin/login
 */
export const adminLogin = async (req, res, next) => {
  try {
    validateLogin(req.body);
    const { email, password } = req.body;

    const result = await authService.login(email, password);
    const dbUser = await userRepository.findById(result.session.user.id);

    if (!dbUser || dbUser.role !== 'admin') {
      throw new ForbiddenError('Admin access only');
    }

    res.cookie('token', result.token, getAuthCookieOptions());

    logger.info('Admin login successful', { email });

    res.status(200).json(
      formatSuccess(
        {
          ...result.session,
          token: result.token,
          authenticated: true,
        },
        'Login successful',
      ),
    );
  } catch (error) {
    if (error?.errorCode === 'UNAUTHORIZED') {
      error.message =
        'Invalid email or password. Use a Supabase account with role=admin.';
    }
    next(error);
  }
};

function getTokenFromRequest(req) {
  if (req.cookies?.token) return req.cookies.token;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/**
 * GET /api/admin/me
 */
export const adminMe = async (req, res, next) => {
  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      return res.status(200).json({ success: true, authenticated: false });
    }

    const accessToken = await resolveAuthToken(token);

    if (!accessToken) {
      return res.status(200).json({ success: true, authenticated: false });
    }

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      return res.status(200).json({ success: true, authenticated: false });
    }

    const dbUser = await userRepository.findById(user.id);

    if (!dbUser || dbUser.role !== 'admin') {
      return res.status(200).json({ success: true, authenticated: false });
    }

    const session = await authService.getUserSession(user.id);

    res.status(200).json({
      success: true,
      authenticated: true,
      data: session,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/books/queue/stats
 */
export const getQueueStats = async (req, res, next) => {
  try {
    const stats = await adminApprovalService.getQueueStats();

    res.status(200).json(
      formatSuccess(stats, 'Approval queue stats retrieved successfully'),
    );
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/books/pending
 */
/**
 * GET /api/admin/books/list?status=pending_review|approved|rejected
 */
export const listBooks = async (req, res, next) => {
  try {
    let status = req.query.status || 'all';
    if (status === 'pending') status = 'pending_review';

    const allowed = ['all', 'pending_review', 'approved', 'rejected'];
    if (!allowed.includes(status)) {
      throw new ValidationError('Invalid status filter');
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const search = req.query.search || req.query.q || '';
    const type = req.query.type || req.query.submissionType || 'all';
    const sort = req.query.sort || 'newest';

    const result = await adminApprovalService.listBooks({
      status,
      page,
      limit,
      search,
      type,
      sort,
    });

    res.status(200).json(formatSuccess(result, 'Books retrieved successfully'));
  } catch (error) {
    next(error);
  }
};

export const getPendingBooks = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const search = req.query.search || req.query.q || '';
    const type = req.query.type || req.query.submissionType || 'all';
    const sort = req.query.sort || 'newest';

    const result = await adminApprovalService.getPendingBooks({
      page,
      limit,
      search,
      type,
      sort,
    });

    logger.info('Admin pending books fetched', {
      adminId: req.user.id,
      count: result.items.length,
      total: result.pagination.total,
    });

    res.status(200).json(
      formatSuccess(result, 'Pending books retrieved successfully'),
    );
  } catch (error) {
    if (error.message) {
      return next(new ValidationError(error.message));
    }
    next(error);
  }
};

/**
 * GET /api/admin/books/:id
 */
export const getBookDetail = async (req, res, next) => {
  try {
    const book = await adminApprovalService.getBookDetail(req.params.id);

    res.status(200).json(formatSuccess(book, 'Book detail retrieved successfully'));
  } catch (error) {
    next(error);
  }
};

export const approveBook = async (req, res, next) => {
  try {
    const result = await adminApprovalService.approveBook(req.params.id, req.user.id, {
      skipValidation: req.body?.skipValidation === true || req.body?.approveChanges === true,
    });

    res.status(200).json(
      formatSuccess(result, 'Book approved successfully'),
    );
  } catch (error) {
    next(error);
  }
};

export const saveBookReviewState = async (req, res, next) => {
  try {
    const state = await adminApprovalService.saveReviewState(
      req.params.id,
      req.user.id,
      req.body || {},
    );
    res.status(200).json(formatSuccess({ reviewState: state }, 'Review state saved'));
  } catch (error) {
    next(error);
  }
};

export const reviewBookContent = async (req, res, next) => {
  try {
    const { target, status, comment } = req.body || {};
    const state = await adminApprovalService.reviewContent(req.params.id, req.user.id, {
      target,
      status,
      comment,
    });
    res.status(200).json(formatSuccess({ reviewState: state }, 'Content review updated'));
  } catch (error) {
    next(error);
  }
};

export const requestBookChanges = async (req, res, next) => {
  try {
    const result = await adminApprovalService.requestChanges(
      req.params.id,
      req.user.id,
      req.body || {},
    );
    res.status(200).json(formatSuccess(result, 'Changes requested — author notified'));
  } catch (error) {
    next(error);
  }
};

export const revertBookApproval = async (req, res, next) => {
  try {
    const book = await adminApprovalService.revertApproval(req.params.id, req.user.id);

    res.status(200).json(
      formatSuccess({ book }, 'Book returned to pending review'),
    );
  } catch (error) {
    next(error);
  }
};

export const rejectBook = async (req, res, next) => {
  try {
    const payload = {
      reason: req.body?.reason || req.body?.review_note || '',
      adminNotes: req.body?.adminNotes || req.body?.admin_notes || '',
      suggestedFixes: req.body?.suggestedFixes || req.body?.suggested_fixes || '',
      severity: req.body?.severity || 'medium',
      notify: req.body?.notify === true,
    };

    const result = await adminApprovalService.rejectBook(
      req.params.id,
      req.user.id,
      payload,
      { notify: payload.notify },
    );

    const message = payload.notify
      ? 'Book rejected and author notified'
      : 'Book rejected';

    res.status(200).json(formatSuccess(result, message));
  } catch (error) {
    next(error);
  }
};

export const notifyAuthorRejection = async (req, res, next) => {
  try {
    const payload = {
      reason: req.body?.reason || req.body?.review_note || '',
      adminNotes: req.body?.adminNotes || req.body?.admin_notes || '',
      suggestedFixes: req.body?.suggestedFixes || req.body?.suggested_fixes || '',
      severity: req.body?.severity || 'medium',
    };

    const result = await adminApprovalService.notifyAuthorAboutRejection(
      req.params.id,
      req.user.id,
      payload,
    );

    res.status(200).json(formatSuccess(result, 'Author notified about rejection'));
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/books/:id/review
 */
export const reviewBook = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, review_note } = req.body;

    const allowed = ['approved', 'rejected', 'pending_review', 'draft', 'archived'];
    if (!allowed.includes(status)) {
      throw new ValidationError('Invalid status');
    }

    const result = await adminApprovalService.reviewBook(
      id,
      status,
      req.user.id,
      review_note,
    );

    logger.info('Book reviewed by admin', {
      bookId: id,
      status,
      adminId: req.user.id,
    });

    res.status(200).json(
      formatSuccess(
        { book: result.book || result, review_note: review_note || null },
        'Book review status updated successfully',
      ),
    );
  } catch (error) {
    next(error);
  }
};

export const getAdminNotifications = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const unreadOnly = req.query.unread === 'true';

    const result = await adminNotificationService.getNotificationsForAdmin(req.user.id, {
      limit,
      unreadOnly,
    });

    res.status(200).json(
      formatSuccess(result, 'Notifications retrieved successfully'),
    );
  } catch (error) {
    next(error);
  }
};

export const markNotificationRead = async (req, res, next) => {
  try {
    await adminNotificationService.markNotificationRead(req.params.id, req.user.id);
    res.status(200).json(formatSuccess(null, 'Notification marked as read'));
  } catch (error) {
    next(error);
  }
};

export const markAllNotificationsRead = async (req, res, next) => {
  try {
    await adminNotificationService.markAllRead(req.user.id);
    res.status(200).json(formatSuccess(null, 'All notifications marked as read'));
  } catch (error) {
    next(error);
  }
};
