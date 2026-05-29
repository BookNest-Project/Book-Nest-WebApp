import { formatSuccess } from '../utils/responseFormatter.js';
import { adminReportsService } from '../services/adminReportsService.js';

export const getReportsCenter = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    const data = await adminReportsService.getReportsCenter({ days });
    res.status(200).json(formatSuccess(data, 'Reports retrieved successfully'));
  } catch (error) {
    next(error);
  }
};
