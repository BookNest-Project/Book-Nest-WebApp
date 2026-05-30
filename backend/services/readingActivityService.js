import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

/** Client sends -getTimezoneOffset(); shift UTC ms so getUTC* = local calendar parts. */
function localDateString(timezoneOffsetMinutes = 0, daysOffset = 0) {
  const ms = Date.now() + timezoneOffsetMinutes * 60 * 1000 - daysOffset * 86400000;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayDateString(timezoneOffsetMinutes = 0) {
  return localDateString(timezoneOffsetMinutes, 0);
}

function yesterdayDateString(timezoneOffsetMinutes = 0) {
  return localDateString(timezoneOffsetMinutes, 1);
}

function dateDaysAgo(daysAgo, timezoneOffsetMinutes = 0) {
  return localDateString(timezoneOffsetMinutes, daysAgo);
}

function extractLastPosition(lastPosition) {
  if (lastPosition == null) return 0;
  if (typeof lastPosition === 'number') return Math.max(0, Math.floor(lastPosition));
  if (typeof lastPosition === 'object' && lastPosition.value != null) {
    return Math.max(0, Math.floor(Number(lastPosition.value) || 0));
  }
  return Math.max(0, Math.floor(Number(lastPosition) || 0));
}

const QUALIFYING_PAGES = 1;
const QUALIFYING_MINUTES = 1;
const QUALIFYING_SECONDS = 20;

function listenSecondsFromRow(row) {
  if (!row) return 0;
  return (row.minutes_read || 0) * 60 + (row.seconds_read || 0);
}

function listenMinutesDisplay(row) {
  return Math.round(listenSecondsFromRow(row) / 60);
}

function rowQualifies(row) {
  if (!row) return false;
  return (
    (row.pages_read || 0) >= QUALIFYING_PAGES ||
    listenSecondsFromRow(row) >= QUALIFYING_SECONDS ||
    (row.minutes_read || 0) >= QUALIFYING_MINUTES
  );
}

function addDaysToDateString(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

export const readingActivityService = {
  async recordSession(
    userId,
    {
      pages_delta = 0,
      minutes_delta = 0,
      seconds_delta = 0,
      timezone_offset_minutes = 0,
      book_completed = false,
    } = {}
  ) {
    const today = todayDateString(timezone_offset_minutes);
    const pages = Math.max(0, Math.floor(pages_delta));
    const listenSeconds =
      Math.max(0, Math.floor(minutes_delta)) * 60 + Math.max(0, Math.floor(seconds_delta));

    if (pages === 0 && listenSeconds === 0 && !book_completed) {
      return;
    }

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('daily_reading_stats')
      .select('id, pages_read, minutes_read, seconds_read, books_active')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle();

    if (fetchError) {
      logger.error('daily_reading_stats fetch failed', { userId, error: fetchError.message });
      const err = new Error(fetchError.message || 'Could not load daily reading stats');
      err.statusCode = 500;
      throw err;
    }

    const priorListenSeconds = listenSecondsFromRow(existing);
    const nextListenSeconds = priorListenSeconds + listenSeconds;
    const nextMinutes = Math.floor(nextListenSeconds / 60);
    const nextSecondsRemainder = nextListenSeconds % 60;
    const booksActiveBump = pages > 0 || listenSeconds > 0 ? 1 : 0;

    if (existing) {
      const { error: updateError } = await supabaseAdmin
        .from('daily_reading_stats')
        .update({
          pages_read: (existing.pages_read || 0) + pages,
          minutes_read: nextMinutes,
          seconds_read: nextSecondsRemainder,
          books_active: Math.max(existing.books_active || 0, booksActiveBump),
        })
        .eq('id', existing.id);

      if (updateError) {
        logger.error('daily_reading_stats update failed', { userId, error: updateError.message });
        const err = new Error(updateError.message || 'Failed to update daily reading stats');
        err.statusCode = 500;
        throw err;
      }
    } else if (pages > 0 || listenSeconds > 0) {
      const { error: insertError } = await supabaseAdmin.from('daily_reading_stats').insert({
        user_id: userId,
        date: today,
        pages_read: pages,
        minutes_read: nextMinutes,
        seconds_read: nextSecondsRemainder,
        books_active: booksActiveBump,
      });

      if (insertError) {
        logger.error('daily_reading_stats insert failed', { userId, error: insertError.message });
        const err = new Error(insertError.message || 'Failed to save daily reading stats');
        err.statusCode = 500;
        throw err;
      }
    }

    if (book_completed) {
      await this.incrementBooksCompleted(userId);
    }

    await this.recalculateStreak(userId, timezone_offset_minutes);
    await this.evaluateAchievements(userId);
  },

  async recalculateStreak(userId, timezoneOffsetMinutes = 0) {
    const today = todayDateString(timezoneOffsetMinutes);

    const { data: dailyRows, error } = await supabaseAdmin
      .from('daily_reading_stats')
      .select('date, pages_read, minutes_read, seconds_read')
      .eq('user_id', userId);

    if (error) {
      logger.error('recalculateStreak fetch failed', { userId, error: error.message });
      throw error;
    }

    const qualifyingDates = new Set(
      (dailyRows || []).filter(rowQualifies).map((r) => r.date)
    );

    let currentStreak = 0;
    let checkDate = today;

    while (qualifyingDates.has(checkDate)) {
      currentStreak += 1;
      checkDate = addDaysToDateString(checkDate, -1);
    }

    let longestStreak = 0;
    let run = 0;
    const sortedDates = [...qualifyingDates].sort();
    for (let i = 0; i < sortedDates.length; i++) {
      if (i === 0) {
        run = 1;
      } else {
        const prev = sortedDates[i - 1];
        const expected = addDaysToDateString(prev, 1);
        run = sortedDates[i] === expected ? run + 1 : 1;
      }
      longestStreak = Math.max(longestStreak, run);
    }
    longestStreak = Math.max(longestStreak, currentStreak);

    const lastReadDate =
      currentStreak > 0 ? today : sortedDates.length ? sortedDates[sortedDates.length - 1] : null;

    const { data: stats } = await supabaseAdmin
      .from('user_reading_stats')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const payload = {
      user_id: userId,
      current_streak: currentStreak,
      longest_streak: longestStreak,
      last_read_date: lastReadDate,
      total_books_completed: stats?.total_books_completed || 0,
      updated_at: new Date().toISOString(),
    };

    if (stats) {
      await supabaseAdmin.from('user_reading_stats').update(payload).eq('user_id', userId);
    } else {
      await supabaseAdmin.from('user_reading_stats').insert(payload);
    }

    return payload;
  },

  async incrementBooksCompleted(userId) {
    const completedFromProgress = await this.countCompletedBooksFromProgress(userId);

    const { data: stats } = await supabaseAdmin
      .from('user_reading_stats')
      .select('total_books_completed')
      .eq('user_id', userId)
      .maybeSingle();

    const total = Math.max(completedFromProgress, (stats?.total_books_completed || 0) + 1);

    if (stats) {
      await supabaseAdmin
        .from('user_reading_stats')
        .update({ total_books_completed: total, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
    } else {
      await supabaseAdmin.from('user_reading_stats').insert({
        user_id: userId,
        total_books_completed: total,
      });
    }

    return total;
  },

  async countCompletedBooksFromProgress(userId) {
    const { data: progressRows } = await supabaseAdmin
      .from('reading_progress')
      .select('completed_at, progress_percent')
      .eq('user_id', userId);

    return (progressRows || []).filter(
      (r) => r.completed_at || (r.progress_percent != null && r.progress_percent >= 100)
    ).length;
  },

  async getBooksCompletedCount(userId) {
    const { data: stats } = await supabaseAdmin
      .from('user_reading_stats')
      .select('total_books_completed')
      .eq('user_id', userId)
      .maybeSingle();

    const fromProgress = await this.countCompletedBooksFromProgress(userId);
    return Math.max(stats?.total_books_completed || 0, fromProgress);
  },

  async evaluateAchievements(userId) {
    const { data: stats } = await supabaseAdmin
      .from('user_reading_stats')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const booksCompleted = await this.getBooksCompletedCount(userId);

    const { data: dailyRows } = await supabaseAdmin
      .from('daily_reading_stats')
      .select('pages_read, minutes_read, seconds_read')
      .eq('user_id', userId);

    const totalPages = (dailyRows || []).reduce((s, r) => s + (r.pages_read || 0), 0);
    const totalMinutes = (dailyRows || []).reduce(
      (s, r) => s + listenMinutesDisplay(r),
      0
    );

    const streak = Math.max(stats?.longest_streak || 0, stats?.current_streak || 0);

    const checks = [
      { id: 'first_book', ok: booksCompleted >= 1 },
      { id: 'books_5', ok: booksCompleted >= 5 },
      { id: 'streak_3', ok: streak >= 3 },
      { id: 'streak_7', ok: streak >= 7 },
      { id: 'streak_30', ok: streak >= 30 },
      { id: 'pages_10', ok: totalPages >= 10 },
      { id: 'pages_100', ok: totalPages >= 100 },
      { id: 'pages_500', ok: totalPages >= 500 },
      { id: 'minutes_15', ok: totalMinutes >= 15 },
      { id: 'minutes_60', ok: totalMinutes >= 60 },
    ];

    for (const { id, ok } of checks) {
      if (!ok) continue;
      const { error } = await supabaseAdmin.from('user_achievements').insert({
        user_id: userId,
        achievement_id: id,
        earned_at: new Date().toISOString(),
      });
      if (error && error.code !== '23505') {
        logger.warn('Achievement insert', { id, error: error.message });
      }
    }
  },

  async hydrateStatsFromProgress(userId, timezoneOffsetMinutes = 0) {
    const { data: dailyRows } = await supabaseAdmin
      .from('daily_reading_stats')
      .select('pages_read, minutes_read, seconds_read')
      .eq('user_id', userId);

    const existingPages = (dailyRows || []).reduce((s, r) => s + (r.pages_read || 0), 0);
    const existingListenSeconds = (dailyRows || []).reduce(
      (s, r) => s + listenSecondsFromRow(r),
      0
    );
    if (existingPages > 0 || existingListenSeconds > 0) return;

    const { data: progressRows } = await supabaseAdmin
      .from('reading_progress')
      .select('last_position, updated_at, book_format_id, progress_percent, completed_at')
      .eq('user_id', userId);

    if (!progressRows?.length) return;

    const formatIds = progressRows.map((r) => r.book_format_id);
    const { data: formats } = await supabaseAdmin
      .from('book_formats')
      .select('id, format_type')
      .in('id', formatIds);

    const formatType = Object.fromEntries((formats || []).map((f) => [f.id, f.format_type]));

    const byDate = {};

    for (const row of progressRows) {
      const pos = extractLastPosition(row.last_position);
      const type = (formatType[row.book_format_id] || '').toUpperCase();
      const updatedDate = row.updated_at?.slice(0, 10);
      if (!updatedDate) continue;

      if (type === 'PDF' && pos > 0) {
        if (!byDate[updatedDate]) byDate[updatedDate] = { pages: 0, seconds: 0 };
        byDate[updatedDate].pages += pos;
      }
    }

    for (const [date, totals] of Object.entries(byDate)) {
      if (totals.pages <= 0) continue;
      const { data: existing } = await supabaseAdmin
        .from('daily_reading_stats')
        .select('id')
        .eq('user_id', userId)
        .eq('date', date)
        .maybeSingle();

      if (existing) continue;

      await supabaseAdmin.from('daily_reading_stats').insert({
        user_id: userId,
        date,
        pages_read: totals.pages,
        minutes_read: 0,
        seconds_read: 0,
        books_active: 1,
      });
    }

    const booksCompleted = (progressRows || []).filter(
      (r) => r.completed_at || (r.progress_percent != null && r.progress_percent >= 100)
    ).length;

    if (booksCompleted > 0) {
      const { data: stats } = await supabaseAdmin
        .from('user_reading_stats')
        .select('total_books_completed')
        .eq('user_id', userId)
        .maybeSingle();

      const total = Math.max(booksCompleted, stats?.total_books_completed || 0);
      if (stats) {
        await supabaseAdmin
          .from('user_reading_stats')
          .update({ total_books_completed: total, updated_at: new Date().toISOString() })
          .eq('user_id', userId);
      } else {
        await supabaseAdmin.from('user_reading_stats').insert({
          user_id: userId,
          total_books_completed: total,
        });
      }
    }

    await this.recalculateStreak(userId, timezoneOffsetMinutes);
    await this.evaluateAchievements(userId);
    logger.info('Hydrated reading stats from progress', { userId, dates: Object.keys(byDate).length });
  },

  async getGamificationProfile(userId, timezoneOffsetMinutes = 0) {
    await this.hydrateStatsFromProgress(userId, timezoneOffsetMinutes);
    await this.recalculateStreak(userId, timezoneOffsetMinutes);

    const { data: stats } = await supabaseAdmin
      .from('user_reading_stats')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const booksCompleted = await this.getBooksCompletedCount(userId);

    const today = todayDateString(timezoneOffsetMinutes);
    const { data: todayStats } = await supabaseAdmin
      .from('daily_reading_stats')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle();

    const weekStart = dateDaysAgo(6, timezoneOffsetMinutes);
    const { data: weekRows } = await supabaseAdmin
      .from('daily_reading_stats')
      .select('date, pages_read, minutes_read, seconds_read')
      .eq('user_id', userId)
      .gte('date', weekStart)
      .lte('date', today)
      .order('date', { ascending: true });

    const weekMap = new Map((weekRows || []).map((row) => [row.date, row]));
    const weekly_activity = [];
    for (let i = 6; i >= 0; i--) {
      const date = dateDaysAgo(i, timezoneOffsetMinutes);
      const row = weekMap.get(date);
      weekly_activity.push({
        date,
        pages_read: row?.pages_read || 0,
        minutes_read: listenMinutesDisplay(row),
      });
    }

    const { data: allDailyRows } = await supabaseAdmin
      .from('daily_reading_stats')
      .select('pages_read, minutes_read, seconds_read')
      .eq('user_id', userId);

    const lifetime = (allDailyRows || []).reduce(
      (acc, row) => ({
        total_pages: acc.total_pages + (row.pages_read || 0),
        total_minutes: acc.total_minutes + listenMinutesDisplay(row),
      }),
      { total_pages: 0, total_minutes: 0 }
    );

    const { data: achievements } = await supabaseAdmin
      .from('user_achievements')
      .select(
        'achievement_id, earned_at, achievement:achievement_definitions(id, title, description, icon)'
      )
      .eq('user_id', userId);

    const { data: allDefs } = await supabaseAdmin.from('achievement_definitions').select('*');

    return {
      streak: {
        current: stats?.current_streak || 0,
        longest: stats?.longest_streak || 0,
        last_read_date: stats?.last_read_date,
      },
      today: {
        pages_read: todayStats?.pages_read || 0,
        minutes_read: listenMinutesDisplay(todayStats),
        books_active: todayStats?.books_active || 0,
      },
      lifetime,
      weekly_activity,
      total_books_completed: booksCompleted,
      achievements: achievements || [],
      achievement_definitions: allDefs || [],
    };
  },
};
