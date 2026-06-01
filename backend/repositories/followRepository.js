import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

async function formatFollowUser(userRow) {
  if (!userRow) return null;

  const { data: profile } = await supabaseAdmin
    .from('reader_profiles')
    .select('display_name, username, avatar_url')
    .eq('user_id', userRow.id)
    .maybeSingle();

  const emailPrefix = userRow.email?.split('@')[0] || 'User';
  const username =
    profile?.username?.replace(/^@/, '').trim().toLowerCase() ||
    emailPrefix.toLowerCase();

  return {
    id: userRow.id,
    name: profile?.display_name || emailPrefix,
    username,
    email: userRow.email,
    avatarUrl: profile?.avatar_url || userRow.avatar_url || null,
    bio: userRow.bio,
    role: userRow.role,
  };
}

async function loadUsersByIds(userIds) {
  if (!userIds.length) return new Map();

  const { data: users, error } = await supabaseAdmin
    .from('users')
    .select('id, email, avatar_url, bio, role')
    .in('id', userIds);

  if (error) throw error;

  const formatted = await Promise.all((users || []).map((user) => formatFollowUser(user)));
  return new Map(formatted.filter(Boolean).map((user) => [user.id, user]));
}

export const followRepository = {
  async follow(followerId, followingId) {
    try {
      if (followerId === followingId) {
        throw new Error('Cannot follow yourself');
      }

      const { error } = await supabaseAdmin
        .from('follows')
        .insert({
          follower_id: followerId,
          following_id: followingId,
        });

      if (error && error.code !== '23505') throw error;
      return { created: !error };
    } catch (error) {
      logger.error('Follow error', { error: error.message });
      throw error;
    }
  },

  async unfollow(followerId, followingId) {
    try {
      const { error } = await supabaseAdmin
        .from('follows')
        .delete()
        .eq('follower_id', followerId)
        .eq('following_id', followingId);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      logger.error('Unfollow error', { error: error.message });
      throw error;
    }
  },

  async isFollowing(followerId, followingId) {
    try {
      const { data, error } = await supabaseAdmin
        .from('follows')
        .select('id')
        .eq('follower_id', followerId)
        .eq('following_id', followingId)
        .maybeSingle();

      if (error) throw error;
      return !!data;
    } catch (error) {
      logger.error('Is following error', { error: error.message });
      return false;
    }
  },

  async getFollowers(userId, page = 1, limit = 20) {
    try {
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      const { data: rows, error, count } = await supabaseAdmin
        .from('follows')
        .select('follower_id', { count: 'exact' })
        .eq('following_id', userId)
        .order('follower_id', { ascending: true })
        .range(from, to);

      if (error) throw error;

      const userIds = [...new Set((rows || []).map((row) => row.follower_id).filter(Boolean))];
      const userMap = await loadUsersByIds(userIds);

      return {
        followers: userIds.map((id) => userMap.get(id)).filter(Boolean),
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      };
    } catch (error) {
      logger.error('Get followers error', { error: error.message });
      throw error;
    }
  },

  async getFollowing(userId, page = 1, limit = 20) {
    try {
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      const { data: rows, error, count } = await supabaseAdmin
        .from('follows')
        .select('following_id', { count: 'exact' })
        .eq('follower_id', userId)
        .order('following_id', { ascending: true })
        .range(from, to);

      if (error) throw error;

      const userIds = [...new Set((rows || []).map((row) => row.following_id).filter(Boolean))];
      const userMap = await loadUsersByIds(userIds);

      return {
        following: userIds.map((id) => userMap.get(id)).filter(Boolean),
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      };
    } catch (error) {
      logger.error('Get following error', { error: error.message });
      throw error;
    }
  },
};
