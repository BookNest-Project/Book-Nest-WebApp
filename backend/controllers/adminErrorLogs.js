import { formatSuccess } from '../utils/responseFormatter.js';
import { adminErrorLogsService } from '../services/adminErrorLogsService.js';

export const listErrorLogs = async (req, res, next) => {
  try {
    const data = await adminErrorLogsService.list(req.query);
    res.status(200).json(formatSuccess(data, 'Error logs retrieved successfully'));
  } catch (error) {
    next(error);
  }
};

export const exportErrorLogs = async (req, res, next) => {
  try {
    const data = await adminErrorLogsService.export(req.query);
    res.status(200).json(formatSuccess(data, 'Error logs export ready'));
  } catch (error) {
    next(error);
  }
};

export const resolveErrorLog = async (req, res, next) => {
  try {
    const data = await adminErrorLogsService.resolve(req.params.id, req.user.id);
    res.status(200).json(formatSuccess(data, 'Error log marked as resolved'));
  } catch (error) {
    next(error);
  }
};

export const unresolveErrorLog = async (req, res, next) => {
  try {
    const data = await adminErrorLogsService.unresolve(req.params.id);
    res.status(200).json(formatSuccess(data, 'Error log reopened'));
  } catch (error) {
    next(error);
  }
};
