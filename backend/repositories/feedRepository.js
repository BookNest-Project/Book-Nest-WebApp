import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

export const feedRepository = {
  async getFeed(userId, page = 1, limit = 20) {
    try {
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      // Get posts from users the current user follows + own posts
      const { data: following } = await supabaseAdmin
        .from('follows')
        .select('following_id')
        .eq('follower_id', userId);

      const followingIds = following?.map(f => f.following_id) || [];
      const allUserIds = [...followingIds, userId];

      const { data: posts, error, count } = await supabaseAdmin
        .from('posts')
        .select(`
          id,
          content,
          image_url,
          status,
          like_count,
          comment_count,
          share_count,
          created_at,
          user:users!user_id (
            id,
            email,
            role,
            avatar_url,
            bio
          )
        `, { count: 'exact' })
        .in('user_id', allUserIds)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      // Get likes for current user
      const postIds = posts.map(p => p.id);
      let likesMap = {};
      
      if (postIds.length > 0) {
        const { data: likes } = await supabaseAdmin
          .from('likes')
          .select('target_id')
          .eq('user_id', userId)
          .eq('target_type', 'post')
          .in('target_id', postIds);
        
        likesMap = likes?.reduce((acc, like) => {
          acc[like.target_id] = true;
          return acc;
        }, {}) || {};
      }

      const formattedPosts = posts.map(post => ({
        id: post.id,
        content: post.content,
        imageUrl: post.image_url,
        likeCount: post.like_count,
        commentCount: post.comment_count,
        shareCount: post.share_count,
        createdAt: post.created_at,
        isLiked: !!likesMap[post.id],
        author: {
          id: post.user.id,
          name: post.user.email.split('@')[0],
          username: post.user.email.split('@')[0],
          avatarUrl: post.user.avatar_url,
          role: post.user.role,
        },
      }));

      return {
        posts: formattedPosts,
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      };
    } catch (error) {
      logger.error('Get feed error', { error: error.message });
      throw error;
    }
  },

  async getUserPosts(userId, includeDrafts = false, page = 1, limit = 20) {
    try {
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      let query = supabaseAdmin
        .from('posts')
        .select(`
          id,
          content,
          image_url,
          status,
          like_count,
          comment_count,
          share_count,
          created_at,
          user:users!user_id (
            id,
            email,
            role,
            avatar_url,
            bio
          )
        `, { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (!includeDrafts) {
        query = query.eq('status', 'published');
      }

      const { data: posts, error, count } = await query;

      if (error) throw error;

      return {
        posts,
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      };
    } catch (error) {
      logger.error('Get user posts error', { error: error.message });
      throw error;
    }
  },

  async createPost(userId, content, imageUrl, status = 'published') {
    try {
      const { data, error } = await supabaseAdmin
        .from('posts')
        .insert({
          user_id: userId,
          content,
          image_url: imageUrl,
          status,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Create post error', { error: error.message });
      throw error;
    }
  },

  async updatePost(postId, userId, updates) {
    try {
      // Verify ownership
      const { data: existing, error: checkError } = await supabaseAdmin
        .from('posts')
        .select('user_id')
        .eq('id', postId)
        .single();

      if (checkError) throw checkError;
      if (existing.user_id !== userId) {
        throw new Error('Unauthorized');
      }

      const { data, error } = await supabaseAdmin
        .from('posts')
        .update({
          content: updates.content,
          image_url: updates.image_url,
          status: updates.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', postId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Update post error', { error: error.message });
      throw error;
    }
  },

  async deletePost(postId, userId) {
    try {
      // Verify ownership
      const { data: existing, error: checkError } = await supabaseAdmin
        .from('posts')
        .select('user_id')
        .eq('id', postId)
        .single();

      if (checkError) throw checkError;
      if (existing.user_id !== userId) {
        throw new Error('Unauthorized');
      }

      const { error } = await supabaseAdmin
        .from('posts')
        .delete()
        .eq('id', postId);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      logger.error('Delete post error', { error: error.message });
      throw error;
    }
  },

  async saveDraft(userId, content, imageUrl) {
    return await feedRepository.createPost(userId, content, imageUrl, 'draft');
  },

  async publishDraft(postId, userId) {
    return await feedRepository.updatePost(postId, userId, { status: 'published' });
  },

  async likePost(userId, postId) {
    try {
      const { error } = await supabaseAdmin
        .from('likes')
        .insert({
          user_id: userId,
          target_type: 'post',
          target_id: postId,
        });

      if (error && error.code !== '23505') throw error;
      return { error: error?.code === '23505' ? null : error };
    } catch (error) {
      logger.error('Like post error', { error: error.message });
      throw error;
    }
  },

  async unlikePost(userId, postId) {
    try {
      const { error } = await supabaseAdmin
        .from('likes')
        .delete()
        .eq('user_id', userId)
        .eq('target_type', 'post')
        .eq('target_id', postId);

      if (error) throw error;
      return { error: null };
    } catch (error) {
      logger.error('Unlike post error', { error: error.message });
      throw error;
    }
  },
};