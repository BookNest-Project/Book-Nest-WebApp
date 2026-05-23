import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

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
      return { success: !error };
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

      const { data: followers, error, count } = await supabaseAdmin
        .from('follows')
        .select(`
          follower_id,
          users!follower_id (
            id,
            email,
            avatar_url,
            bio,
            role
          )
        `, { count: 'exact' })
        .eq('following_id', userId)
        .range(from, to);

      if (error) throw error;

      const formattedFollowers = followers.map(f => ({
        id: f.users.id,
        name: f.users.email.split('@')[0],
        email: f.users.email,
        avatarUrl: f.users.avatar_url,
        bio: f.users.bio,
        role: f.users.role,
      }));

      return {
        followers: formattedFollowers,
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

      const { data: following, error, count } = await supabaseAdmin
        .from('follows')
        .select(`
          following_id,
          users!following_id (
            id,
            email,
            avatar_url,
            bio,
            role
          )
        `, { count: 'exact' })
        .eq('follower_id', userId)
        .range(from, to);

      if (error) throw error;

      const formattedFollowing = following.map(f => ({
        id: f.users.id,
        name: f.users.email.split('@')[0],
        email: f.users.email,
        avatarUrl: f.users.avatar_url,
        bio: f.users.bio,
        role: f.users.role,
      }));

      return {
        following: formattedFollowing,
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