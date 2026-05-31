import webpush from 'web-push';
import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@booknest.app';

let vapidReady = false;

function ensureVapid() {
  if (vapidReady) return true;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    logger.warn('VAPID keys not configured — push notifications disabled');
    return false;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  vapidReady = true;
  return true;
}

function localDateString(offsetMinutes = 0) {
  const ms = Date.now() + offsetMinutes * 60 * 1000;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function rowQualifies(row) {
  if (!row) return false;
  const listenSec = (row.minutes_read || 0) * 60 + (row.seconds_read || 0);
  return (row.pages_read || 0) >= 1 || listenSec >= 20;
}

export const notificationService = {
  getVapidPublicKey() {
    return VAPID_PUBLIC || null;
  },

  async saveSubscription(userId, { endpoint, keys, timezone_offset_minutes = 0 }) {
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      const err = new Error('Invalid push subscription');
      err.statusCode = 400;
      throw err;
    }

    const { error } = await supabaseAdmin.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        timezone_offset_minutes: timezone_offset_minutes || 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,endpoint' }
    );

    if (error) {
      logger.error('push_subscriptions upsert failed', { userId, error: error.message });
      throw error;
    }
  },

  async removeSubscription(userId, endpoint) {
    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint);

    if (error) throw error;
  },

  async sendPush(subscription, payload) {
    if (!ensureVapid()) return false;

    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(payload)
      );
      return true;
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await supabaseAdmin
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', subscription.endpoint);
      }
      logger.warn('Push send failed', { endpoint: subscription.endpoint, error: error.message });
      return false;
    }
  },

  async notifyFollowersOfNewPost(authorId, authorName) {
    if (!ensureVapid()) return { sent: 0, skipped: true };

    const { data: followers, error } = await supabaseAdmin
      .from('follows')
      .select('follower_id')
      .eq('following_id', authorId);

    if (error || !followers?.length) return { sent: 0 };

    let sent = 0;
    const body = `${authorName} shared a new post on BookNest.`;

    for (const { follower_id: followerId } of followers) {
      const { data: prefs } = await supabaseAdmin
        .from('user_settings')
        .select('push_notifications')
        .eq('user_id', followerId)
        .maybeSingle();

      if (prefs && prefs.push_notifications === false) continue;

      const { data: subs } = await supabaseAdmin
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', followerId);

      for (const sub of subs || []) {
        const ok = await this.sendPush(sub, {
          title: 'New post from someone you follow',
          body,
          url: '/community',
        });
        if (ok) sent += 1;
      }
    }

    return { sent };
  },

  async sendStreakReminders() {
    if (!ensureVapid()) return { sent: 0, skipped: true };

    const { data: subs, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth, timezone_offset_minutes');

    if (error || !subs?.length) return { sent: 0 };

    let sent = 0;

    for (const sub of subs) {
      const tz = sub.timezone_offset_minutes || 0;
      const localHour = new Date(Date.now() + tz * 60 * 1000).getUTCHours();

      // Remind between 18:00–21:00 user local time
      if (localHour < 18 || localHour > 21) continue;

      const { data: prefs } = await supabaseAdmin
        .from('user_settings')
        .select('push_notifications')
        .eq('user_id', sub.user_id)
        .maybeSingle();

      if (prefs && prefs.push_notifications === false) continue;

      const today = localDateString(tz);
      const { data: todayRow } = await supabaseAdmin
        .from('daily_reading_stats')
        .select('pages_read, minutes_read, seconds_read')
        .eq('user_id', sub.user_id)
        .eq('date', today)
        .maybeSingle();

      if (rowQualifies(todayRow)) continue;

      const { data: stats } = await supabaseAdmin
        .from('user_reading_stats')
        .select('current_streak')
        .eq('user_id', sub.user_id)
        .maybeSingle();

      const streak = stats?.current_streak || 0;
      if (streak < 1) continue;

      const ok = await this.sendPush(sub, {
        title: 'Keep your streak alive',
        body: `You have a ${streak}-day reading streak. Read or listen for a minute today.`,
        url: '/dashboard/reading',
      });
      if (ok) sent += 1;
    }

    return { sent };
  },
};

/** Hourly cron hook — filters by local evening window inside sendStreakReminders */
export function startStreakReminderCron() {
  const HOUR_MS = 60 * 60 * 1000;
  setInterval(() => {
    notificationService.sendStreakReminders().catch((err) => {
      logger.error('Streak reminder cron failed', { error: err.message });
    });
  }, HOUR_MS);
  logger.info('Streak reminder cron started (hourly)');
}
