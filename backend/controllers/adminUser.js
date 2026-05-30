import { formatSuccess } from '../utils/responseFormatter.js';
import { adminUserService } from '../services/adminUserService.js';

import { adminUserBulkService } from '../services/adminUserBulkService.js';

export const bulkUploadUsers = async (req, res, next) => {
  try {
    const rows = req.body?.rows;
    const summary = await adminUserBulkService.processBulkRows(rows, req.user?.id);
    res.status(200).json(formatSuccess(summary, 'Bulk import completed'));
  } catch (error) {
    if (error.statusCode === 400) {
      error.statusCode = 400;
    }
    next(error);
  }
};

export const getUserStats = async (req, res, next) => {
  try {
    const stats = await adminUserService.getStats();
    res.status(200).json(formatSuccess(stats, 'User stats retrieved successfully'));
  } catch (error) {
    next(error);
  }
};

export const listUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = req.query.search || req.query.q || '';
    const role = req.query.role || null;
    const status = req.query.status || null;
    const segment = req.query.segment || null;

    const result = await adminUserService.listUsers({
      page,
      limit,
      search,
      role,
      status,
      segment,
    });

    res.status(200).json(formatSuccess(result, 'Users retrieved successfully'));
  } catch (error) {
    next(error);
  }
};

export const exportUsers = async (req, res, next) => {
  try {
    const search = req.query.search || req.query.q || '';
    const role = req.query.role || null;
    const status = req.query.status || null;

    const result = await adminUserService.exportUsers({ search, role, status });
    res.status(200).json(formatSuccess(result, 'Users export ready'));
  } catch (error) {
    next(error);
  }
};

export const getUserDetail = async (req, res, next) => {
  try {
    const data = await adminUserService.getUserDetail(req.params.id);
    res.status(200).json(formatSuccess(data, 'User detail retrieved'));
  } catch (error) {
    next(error);
  }
};

export const banUser = async (req, res, next) => {
  try {
    const { reason } = req.body || {};
    const data = await adminUserService.banUser(req.params.id, {
      reason,
      adminId: req.user?.id,
    });
    res.status(200).json(formatSuccess(data, 'User banned successfully'));
  } catch (error) {
    next(error);
  }
};

export const approveUser = async (req, res, next) => {
  try {
    const data = await adminUserService.approveUser(req.params.id, {
      adminId: req.user?.id,
    });
    res.status(200).json(formatSuccess(data, 'User approved successfully'));
  } catch (error) {
    next(error);
  }
};

export const updateUserStatus = async (req, res, next) => {
  try {
    const { accountStatus, reason } = req.body || {};
    const data = await adminUserService.updateUserStatus(req.params.id, {
      accountStatus,
      reason,
      adminId: req.user?.id,
    });
    res.status(200).json(formatSuccess(data, 'User status updated successfully'));
  } catch (error) {
    next(error);
  }
};
