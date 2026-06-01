import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

async function resolveActor(actorId) {
  if (!actorId) return null;

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id, email, avatar_url')
    .eq('id', actorId)
    .maybeSingle();

  if (!user) return null;

  const { data: profile } = await supabaseAdmin
    .from('reader_profiles')
    .select('display_name, avatar_url, username')
    .eq('user_id', actorId)
    .maybeSingle();

  return {
    id: user.id,
    name: profile?.display_name || user.email?.split('@')[0] || 'User',
    avatarUrl: profile?.avatar_url || user.avatar_url || null,
    username:
      profile?.username?.replace(/^@/, '').trim().toLowerCase() ||
      user.email?.split('@')[0]?.toLowerCase() ||
      null,
  };
}

function formatRow(row, actor) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    url: row.url,
    isRead: row.is_read,
    createdAt: row.created_at,
    actorId: row.actor_id || null,
    actor,
    metadata: row.metadata || {},
  };
}

export const notificationRepository = {
  async create({ userId, type, title, body, url, actorId, metadata = {} }) {
    const { data, error } = await supabaseAdmin
      .from('user_notifications')
      .insert({
        user_id: userId,
        type,
        title,
        body,
        url,
        actor_id: actorId || null,
        metadata,
      })
      .select('id')
      .single();

    if (error) {
      logger.error('Create notification failed', { userId, type, error: error.message });
      throw error;
    }

    return data;
  },

  async list(userId, page = 1, limit = 20, { unreadOnly = false } = {}) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from('user_notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', userId);

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    const actorIds = [...new Set((data || []).map((r) => r.actor_id).filter(Boolean))];
    const actorMap = new Map();

    await Promise.all(
      actorIds.map(async (id) => {
        actorMap.set(id, await resolveActor(id));
      })
    );

    return {
      notifications: (data || []).map((row) =>
        formatRow(row, row.actor_id ? actorMap.get(row.actor_id) : null)
      ),
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };
  },

  async getUnreadCount(userId) {
    const { count, error } = await supabaseAdmin
      .from('user_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) throw error;
    return count || 0;
  },

  async markAsRead(notificationId, userId) {
    const { error } = await supabaseAdmin
      .from('user_notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) throw error;
    return { success: true };
  },

  async markAllAsRead(userId) {
    const { error } = await supabaseAdmin
      .from('user_notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) throw error;
    return { success: true };
  },

  /**
   * Remove unread notifications for a chat or post the user has opened.
   */
  async dismissByContext(userId, { chatId, postId } = {}) {
    if (!chatId && !postId) {
      return { dismissed: 0 };
    }

    let query = supabaseAdmin
      .from('user_notifications')
      .delete()
      .eq('user_id', userId)
      .eq('is_read', false);

    if (chatId) {
      query = query.eq('type', 'message').contains('metadata', { chatId });
    }

    if (postId) {
      query = query.eq('type', 'post').contains('metadata', { postId });
    }

    const { data, error } = await query.select('id');

    if (error) {
      logger.error('Dismiss notifications by context failed', {
        userId,
        chatId,
        postId,
        error: error.message,
      });
      throw error;
    }

    return { dismissed: data?.length ?? 0 };
  },
};
