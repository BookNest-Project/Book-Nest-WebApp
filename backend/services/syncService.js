import { progressService } from './progressService.js';
import { readingActivityService } from './readingActivityService.js';
import { logger } from '../utils/logger.js';

export const syncService = {
  /**
   * Apply queued offline reading progress + activity in one request.
   * Progress uses max-percent merge; activity/streaks merge server-side in recordSession.
   */
  async processOfflineBatch(userId, { progress = [], activity = null } = {}) {
    const result = {
      progress: [],
      activity: null,
      profile: null,
    };

    for (const item of progress) {
      if (!item?.book_format_id) continue;
      try {
        const syncResult = await progressService.syncProgress(userId, {
          book_format_id: item.book_format_id,
          progress_percent: item.progress_percent,
          last_position: item.last_position,
          timezone_offset_minutes: item.timezone_offset_minutes ?? 0,
        });
        result.progress.push({
          book_format_id: item.book_format_id,
          ok: true,
          ...syncResult,
        });
      } catch (error) {
        logger.warn('Offline batch progress item failed', {
          userId,
          book_format_id: item.book_format_id,
          error: error.message,
        });
        result.progress.push({
          book_format_id: item.book_format_id,
          ok: false,
          error: error.message,
        });
      }
    }

    const pages = Math.max(0, Math.floor(Number(activity?.pages_delta) || 0));
    const minutes = Math.max(0, Math.floor(Number(activity?.minutes_delta) || 0));
    const seconds = Math.max(0, Math.floor(Number(activity?.seconds_delta) || 0));
    const tz = Number.isFinite(Number(activity?.timezone_offset_minutes))
      ? Number(activity.timezone_offset_minutes)
      : 0;

    if (pages > 0 || minutes > 0 || seconds > 0) {
      await readingActivityService.recordSession(userId, {
        pages_delta: pages,
        minutes_delta: minutes,
        seconds_delta: seconds,
        timezone_offset_minutes: tz,
      });
      result.activity = { recorded: true, pages, minutes, seconds };
    }

    result.profile = await readingActivityService.getGamificationProfile(userId, tz);

    return result;
  },
};
