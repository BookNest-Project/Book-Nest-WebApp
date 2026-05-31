import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

function formatAuthor(user) {
  if (!user) return null;
  const u = Array.isArray(user) ? user[0] : user;
  return {
    id: u.id,
    name: u.email?.split('@')[0] || 'User',
    username: u.email?.split('@')[0] || 'user',
    avatarUrl: u.avatar_url,
  };
}

function formatComment(row, likesMap = {}, replies = []) {
  return {
    id: row.id,
    content: row.content,
    author: formatAuthor(row.user),
    likeCount: row.like_count || 0,
    isLiked: !!likesMap[row.id],
    replyCount: replies.length,
    replies: replies.map((r) => formatComment(r, likesMap)),
    createdAt: row.created_at,
  };
}

export const commentRepository = {
  async getPostComments(postId, viewerUserId = null) {
    const { data: rows, error } = await supabaseAdmin
      .from('comments')
      .select(`
        id,
        content,
        like_count,
        created_at,
        parent_comment_id,
        user:users!user_id ( id, email, avatar_url )
      `)
      .eq('post_id', postId)
      .eq('is_approved', true)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const allIds = (rows || []).map((r) => r.id);
    let likesMap = {};
    if (viewerUserId && allIds.length) {
      const { data: likes } = await supabaseAdmin
        .from('likes')
        .select('target_id')
        .eq('user_id', viewerUserId)
        .eq('target_type', 'comment')
        .in('target_id', allIds);
      likesMap = (likes || []).reduce((acc, l) => {
        acc[l.target_id] = true;
        return acc;
      }, {});
    }

    const topLevel = (rows || []).filter((r) => !r.parent_comment_id);
    const repliesByParent = new Map();
    for (const row of rows || []) {
      if (!row.parent_comment_id) continue;
      if (!repliesByParent.has(row.parent_comment_id)) {
        repliesByParent.set(row.parent_comment_id, []);
      }
      repliesByParent.get(row.parent_comment_id).push(row);
    }

    return topLevel
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((row) => formatComment(row, likesMap, repliesByParent.get(row.id) || []));
  },

  async createComment(postId, userId, content, parentCommentId = null) {
    const { data, error } = await supabaseAdmin
      .from('comments')
      .insert({
        post_id: postId,
        user_id: userId,
        parent_comment_id: parentCommentId,
        content: content.trim(),
      })
      .select(`
        id,
        content,
        like_count,
        created_at,
        parent_comment_id,
        user:users!user_id ( id, email, avatar_url )
      `)
      .single();

    if (error) throw error;
    return formatComment(data);
  },

  async likeComment(userId, commentId) {
    const { error } = await supabaseAdmin.from('likes').insert({
      user_id: userId,
      target_type: 'comment',
      target_id: commentId,
    });
    if (error && error.code !== '23505') throw error;
  },

  async unlikeComment(userId, commentId) {
    const { error } = await supabaseAdmin
      .from('likes')
      .delete()
      .eq('user_id', userId)
      .eq('target_type', 'comment')
      .eq('target_id', commentId);
    if (error) throw error;
  },
};
