import { syncService } from '../services/syncService.js';
import { formatSuccess } from '../utils/responseFormatter.js';

export const syncController = {
  async processOfflineBatch(req, res, next) {
    try {
      const { progress, activity } = req.body ?? {};
      const progressList = Array.isArray(progress) ? progress : [];

      if (
        progressList.length === 0 &&
        !(activity?.pages_delta || activity?.minutes_delta || activity?.seconds_delta)
      ) {
        return res.status(400).json({
          success: false,
          error: { message: 'Nothing to sync' },
        });
      }

      const result = await syncService.processOfflineBatch(req.user.id, {
        progress: progressList,
        activity,
      });

      res.status(200).json(formatSuccess(result, 'Offline data synced'));
    } catch (error) {
      next(error);
    }
  },
};
