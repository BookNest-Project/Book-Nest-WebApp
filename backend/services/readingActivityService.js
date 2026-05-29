import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

function todayDateString(timezoneOffsetMinutes = 0) {
  const d = new Date(Date.now() + timezoneOffsetMinutes * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function yesterdayDateString(timezoneOffsetMinutes = 0) {
  const d = new Date(Date.now() + timezoneOffsetMinutes * 60 * 1000 - 86400000);
  return d.toISOString().slice(0, 10);
}

const QUALIFYING_PAGES = 1;
const QUALIFYING_MINUTES = 1;

/**
 * Record daily reading activity and update streaks / achievements.
 */
export const readingActivityService = {
  async recordSession(
    userId,
    {
      pages_delta = 0,
      minutes_delta = 0,
      books_active = 0,
      timezone_offset_minutes = 0,
      book_completed = false,
    } = {}
  ) {
    const today = todayDateString(timezone_offset_minutes);
    const pages = Math.max(0, Math.floor(pages_delta));
    const minutes = Math.max(0, Math.floor(minutes_delta));

    const { data: existing } = await supabaseAdmin
      .from('daily_reading_stats')
      .select('id, pages_read, minutes_read, books_active')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from('daily_reading_stats')
        .update({
          pages_read: (existing.pages_read || 0) + pages,
          minutes_read: (existing.minutes_read || 0) + minutes,
          books_active: Math.max(existing.books_active || 0, books_active),
        })
        .eq('id', existing.id);
    } else {
      await supabaseAdmin.from('daily_reading_stats').insert({
        user_id: userId,
        date: today,
        pages_read: pages,
        minutes_read: minutes,
        books_active: books_active || 0,
      });
    }

    const qualifies =
      pages >= QUALIFYING_PAGES ||
      minutes >= QUALIFYING_MINUTES ||
      books_active > 0;

    if (qualifies) {
      await this.updateStreak(userId, today, timezone_offset_minutes);
    }

    if (book_completed) {
      await this.incrementBooksCompleted(userId);
    }

    await this.evaluateAchievements(userId);
  },

  async updateStreak(userId, today, timezoneOffsetMinutes) {
    const yesterday = yesterdayDateString(timezoneOffsetMinutes);

    const { data: stats } = await supabaseAdmin
      .from('user_reading_stats')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    let currentStreak = 1;
    let longestStreak = 1;
    const lastRead = stats?.last_read_date;

    if (lastRead === today) {
      return stats;
    }

    if (lastRead === yesterday) {
      currentStreak = (stats?.current_streak || 0) + 1;
    } else if (lastRead && lastRead !== today) {
      currentStreak = 1;
    }

    longestStreak = Math.max(currentStreak, stats?.longest_streak || 0);

    const payload = {
      user_id: userId,
      current_streak: currentStreak,
      longest_streak: longestStreak,
      last_read_date: today,
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
    const { data: stats } = await supabaseAdmin
      .from('user_reading_stats')
      .select('total_books_completed')
      .eq('user_id', userId)
      .maybeSingle();

    const total = (stats?.total_books_completed || 0) + 1;

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

  async evaluateAchievements(userId) {
    const { data: stats } = await supabaseAdmin
      .from('user_reading_stats')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const { data: dailyRows } = await supabaseAdmin
      .from('daily_reading_stats')
      .select('pages_read, minutes_read')
      .eq('user_id', userId);

    const totalPages = (dailyRows || []).reduce((s, r) => s + (r.pages_read || 0), 0);
    const totalMinutes = (dailyRows || []).reduce((s, r) => s + (r.minutes_read || 0), 0);

    const checks = [
      { id: 'first_book', ok: (stats?.total_books_completed || 0) >= 1 },
      { id: 'books_5', ok: (stats?.total_books_completed || 0) >= 5 },
      { id: 'streak_3', ok: (stats?.current_streak || 0) >= 3 },
      { id: 'streak_7', ok: (stats?.current_streak || 0) >= 7 },
      { id: 'streak_30', ok: (stats?.current_streak || 0) >= 30 },
      { id: 'pages_100', ok: totalPages >= 100 },
      { id: 'pages_500', ok: totalPages >= 500 },
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

  async getGamificationProfile(userId) {
    const { data: stats } = await supabaseAdmin
      .from('user_reading_stats')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const today = todayDateString(0);
    const { data: todayStats } = await supabaseAdmin
      .from('daily_reading_stats')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle();

    const { data: achievements } = await supabaseAdmin
      .from('user_achievements')
      .select('achievement_id, earned_at, achievement:achievement_definitions(id, title, description, icon)')
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
        minutes_read: todayStats?.minutes_read || 0,
        books_active: todayStats?.books_active || 0,
      },
      total_books_completed: stats?.total_books_completed || 0,
      achievements: achievements || [],
      achievement_definitions: allDefs || [],
    };
  },
};
