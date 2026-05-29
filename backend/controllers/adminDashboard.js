import { formatSuccess } from '../utils/responseFormatter.js';
import { adminDashboardService } from '../services/adminDashboardService.js';

export const getDashboardOverview = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    const data = await adminDashboardService.getOverview({ days });
    res.status(200).json(formatSuccess(data, 'Dashboard overview retrieved'));
  } catch (error) {
    next(error);
  }
};
