import { adminTasksService } from '../services/adminTasksService.js';
import { formatSuccess } from '../utils/responseFormatter.js';

export async function listAdminTasks(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 15;
    const search = req.query.search || req.query.q || '';

    const data = await adminTasksService.listRecentTasks({ search, page, limit });
    res.status(200).json(formatSuccess(data, 'Admin tasks retrieved'));
  } catch (error) {
    next(error);
  }
}
