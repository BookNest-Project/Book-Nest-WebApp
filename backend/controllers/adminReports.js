import { formatSuccess } from '../utils/responseFormatter.js';
import { adminReportsService } from '../services/adminReportsService.js';

function reportDaysFromQuery(query) {
  if (query.preset === 'custom' && query.from && query.to) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
    const diff = Math.floor((to - from) / 86400000) + 1;
    return Math.max(1, Math.min(365, diff));
  }
  return parseInt(query.days, 10) || 30;
}

export const getReportsCenter = async (req, res, next) => {
  try {
    const days = reportDaysFromQuery(req.query);
    const data = await adminReportsService.getReportsCenter({
      days,
      preset: req.query.preset,
      from: req.query.from,
      to: req.query.to,
      format: req.query.format,
    });
    res.status(200).json(formatSuccess(data, 'Reports retrieved successfully'));
  } catch (error) {
    next(error);
  }
};

export const getUserGrowthReport = async (req, res, next) => {
  try {
    const days = reportDaysFromQuery(req.query);
    const data = await adminReportsService.getUserGrowth({ days });
    res.status(200).json(formatSuccess(data, 'User growth report retrieved successfully'));
  } catch (error) {
    next(error);
  }
};
