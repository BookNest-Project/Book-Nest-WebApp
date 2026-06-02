import { adminService } from '../services/adminService.js';
import { formatSuccess } from '../utils/responseFormatter.js';

export const getDashboardStats = async (req, res, next) => {
  try {
    const stats = await adminService.getDashboardStats();
    res.json(formatSuccess(stats, 'Dashboard stats'));
  } catch (error) {
    next(error);
  }
};

export const getSystemAnalytics = async (req, res, next) => {
  try {
    const analytics = await adminService.getSystemAnalytics();
    res.json(formatSuccess(analytics, 'System analytics'));
  } catch (error) {
    next(error);
  }
};

export const listUsers = async (req, res, next) => {
  try {
    const users = await adminService.listUsers(req.query);
    res.json(formatSuccess({ users }, 'Users retrieved'));
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (req, res, next) => {
  try {
    const detail = await adminService.getUserById(req.params.id);
    if (!detail) {
      return res.status(404).json({
        success: false,
        error: { message: 'User not found', code: 'NOT_FOUND' },
      });
    }
    res.json(formatSuccess(detail, 'User retrieved'));
  } catch (error) {
    next(error);
  }
};

export const updateUserStatus = async (req, res, next) => {
  try {
    const user = await adminService.updateUserStatus(req.params.id, req.body.account_status);
    res.json(formatSuccess(user, 'User status updated'));
  } catch (error) {
    next(error);
  }
};

export const listBooks = async (req, res, next) => {
  try {
    const books = await adminService.listBooks(req.query);
    res.json(formatSuccess({ books }, 'Books retrieved'));
  } catch (error) {
    next(error);
  }
};

export const getBookById = async (req, res, next) => {
  try {
    const book = await adminService.getBookById(req.params.id);
    if (!book) {
      return res.status(404).json({
        success: false,
        error: { message: 'Book not found', code: 'NOT_FOUND' },
      });
    }
    res.json(formatSuccess(book, 'Book retrieved'));
  } catch (error) {
    next(error);
  }
};

export const reviewBook = async (req, res, next) => {
  try {
    const book = await adminService.reviewBook(req.params.id, req.user.id, req.body);
    res.json(formatSuccess(book, 'Book review updated'));
  } catch (error) {
    next(error);
  }
};

export const reviewBookFormat = async (req, res, next) => {
  try {
    const format = await adminService.reviewBookFormat(
      req.params.bookId,
      req.params.formatId,
      req.body
    );
    res.json(formatSuccess(format, 'Format review updated'));
  } catch (error) {
    next(error);
  }
};

export const listReports = async (req, res, next) => {
  try {
    const reports = await adminService.listReports(req.query);
    res.json(formatSuccess({ reports }, 'Reports retrieved'));
  } catch (error) {
    next(error);
  }
};

export const updateReport = async (req, res, next) => {
  try {
    const report = await adminService.updateReport(req.params.id, req.user.id, req.body);
    res.json(formatSuccess(report, 'Report updated'));
  } catch (error) {
    next(error);
  }
};

export const listWithdrawals = async (req, res, next) => {
  try {
    const withdrawals = await adminService.listWithdrawals(req.query);
    res.json(formatSuccess({ withdrawals }, 'Withdrawals retrieved'));
  } catch (error) {
    next(error);
  }
};

export const reviewWithdrawal = async (req, res, next) => {
  try {
    const withdrawal = await adminService.reviewWithdrawal(
      req.params.id,
      req.user.id,
      req.body
    );
    res.json(formatSuccess(withdrawal, 'Withdrawal reviewed'));
  } catch (error) {
    next(error);
  }
};

export const inviteUser = async (req, res, next) => {
  try {
    const result = await adminService.inviteUser(req.user.id, req.body);
    res.status(201).json(formatSuccess(result, 'Invite sent'));
  } catch (error) {
    next(error);
  }
};

export const createAuthorProfile = async (req, res, next) => {
  try {
    const profile = await adminService.createAuthorProfile(req.user.id, req.body);
    res.status(201).json(formatSuccess(profile, 'Author profile created'));
  } catch (error) {
    next(error);
  }
};

export const createPublisherProfile = async (req, res, next) => {
  try {
    const profile = await adminService.createPublisherProfile(req.user.id, req.body);
    res.status(201).json(formatSuccess(profile, 'Publisher profile created'));
  } catch (error) {
    next(error);
  }
};

export const linkAuthorProfile = async (req, res, next) => {
  try {
    const profile = await adminService.linkAuthorProfile(
      req.params.id,
      req.body.user_id,
      req.user.id
    );
    res.json(formatSuccess(profile, 'Author profile linked'));
  } catch (error) {
    next(error);
  }
};

export const linkPublisherProfile = async (req, res, next) => {
  try {
    const profile = await adminService.linkPublisherProfile(
      req.params.id,
      req.body.user_id,
      req.user.id
    );
    res.json(formatSuccess(profile, 'Publisher profile linked'));
  } catch (error) {
    next(error);
  }
};

export const createCategory = async (req, res, next) => {
  try {
    const category = await adminService.createCategory(req.body);
    res.status(201).json(formatSuccess(category, 'Category created'));
  } catch (error) {
    next(error);
  }
};
