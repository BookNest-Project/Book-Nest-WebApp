import { readingActivityService } from '../services/readingActivityService.js';
import { formatSuccess } from '../utils/responseFormatter.js';

export const gamificationController = {
  async getMe(req, res, next) {
    try {
      const tz = Number.parseInt(req.query.timezone_offset_minutes, 10);
      const timezoneOffsetMinutes = Number.isFinite(tz) ? tz : 0;
      const profile = await readingActivityService.getGamificationProfile(
        req.user.id,
        timezoneOffsetMinutes
      );
      res.status(200).json(formatSuccess(profile, 'Gamification profile'));
    } catch (error) {
      next(error);
    }
  },

  async recordActivity(req, res, next) {
    try {
      const tz = Number.parseInt(req.body.timezone_offset_minutes, 10);
      const timezoneOffsetMinutes = Number.isFinite(tz) ? tz : 0;
      const pages = Math.max(0, Math.floor(Number(req.body.pages_delta) || 0));
      const minutes = Math.max(0, Math.floor(Number(req.body.minutes_delta) || 0));
      const seconds = Math.max(0, Math.floor(Number(req.body.seconds_delta) || 0));

      if (pages === 0 && minutes === 0 && seconds === 0) {
        return res.status(400).json({
          success: false,
          error: { message: 'No reading activity to record' },
        });
      }

      await readingActivityService.recordSession(req.user.id, {
        pages_delta: pages,
        minutes_delta: minutes,
        seconds_delta: seconds,
        timezone_offset_minutes: timezoneOffsetMinutes,
      });

      res.status(200).json(formatSuccess({ recorded: true }, 'Reading activity recorded'));
    } catch (error) {
      next(error);
    }
  },
};
