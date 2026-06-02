import { followRepository } from '../repositories/followRepository.js';
import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { getActiveUserIdSet } from '../utils/activeUsers.js';

const POST_SELECT = `
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
`;

async function loadTagsForPosts(postIds) {
  if (!postIds.length) return new Map();

  const { data: tags } = await supabaseAdmin
    .from('post_tags')
    .select('post_id, tag_type, tag_id')
    .in('post_id', postIds);

  const userIds = [...new Set((tags || []).filter((t) => t.tag_type === 'user').map((t) => t.tag_id))];
  const bookIds = [...new Set((tags || []).filter((t) => t.tag_type === 'book').map((t) => t.tag_id))];

  const usersMap = {};
  const booksMap = {};

  if (userIds.length) {
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, email, avatar_url, role')
      .in('id', userIds);
    for (const u of users || []) {
      usersMap[u.id] = {
        id: u.id,
        type: 'user',
        name: u.email.split('@')[0],
        username: u.email.split('@')[0],
        avatarUrl: u.avatar_url,
      };
    }
  }

  if (bookIds.length) {
    const { data: books } = await supabaseAdmin
      .from('books')
      .select('id, title, cover_url')
      .in('id', bookIds);
    for (const b of books || []) {
      booksMap[b.id] = {
        id: b.id,
        type: 'book',
        title: b.title,
        coverUrl: b.cover_url,
      };
    }
  }

  const byPost = new Map();
  for (const tag of tags || []) {
    if (!byPost.has(tag.post_id)) byPost.set(tag.post_id, []);
    const item =
      tag.tag_type === 'user' ? usersMap[tag.tag_id] : booksMap[tag.tag_id];
    if (item) byPost.get(tag.post_id).push(item);
  }
  return byPost;
}

function formatPostRow(post, likesMap = {}, tagsMap = new Map(), followingIds = null) {
  const user = Array.isArray(post.user) ? post.user[0] : post.user;
  const authorId = user?.id;
  return {
    id: post.id,
    content: post.content,
    imageUrl: post.image_url,
    status: post.status,
    likeCount: post.like_count || 0,
    commentCount: post.comment_count || 0,
    shareCount: post.share_count || 0,
    createdAt: post.created_at,
    isLiked: !!likesMap[post.id],
    isFromFollowing: followingIds ? followingIds.has(authorId) : false,
    tags: tagsMap.get(post.id) || [],
    author: {
      id: authorId,
      name: user?.email?.split('@')[0] || 'User',
      username: user?.email?.split('@')[0] || 'user',
      avatarUrl: user?.avatar_url,
      role: user?.role || 'reader',
    },
  };
}

async function formatPostsList(posts, viewerUserId, followingIds = null) {
  const postIds = (posts || []).map((p) => p.id);
  let likesMap = {};

  if (viewerUserId && postIds.length) {
    const { data: likes } = await supabaseAdmin
      .from('likes')
      .select('target_id')
      .eq('user_id', viewerUserId)
      .eq('target_type', 'post')
      .in('target_id', postIds);

    likesMap = (likes || []).reduce((acc, like) => {
      acc[like.target_id] = true;
      return acc;
    }, {});
  }

  const tagsMap = await loadTagsForPosts(postIds);
  return (posts || []).map((post) => formatPostRow(post, likesMap, tagsMap, followingIds));
}

async function savePostTags(postId, taggedUsers = [], taggedBooks = []) {
  await supabaseAdmin.from('post_tags').delete().eq('post_id', postId);

  const rows = [
    ...taggedUsers.map((id) => ({ post_id: postId, tag_type: 'user', tag_id: id })),
    ...taggedBooks.map((id) => ({ post_id: postId, tag_type: 'book', tag_id: id })),
  ];

  if (rows.length) {
    const { error } = await supabaseAdmin.from('post_tags').insert(rows);
    if (error) throw error;
  }
}

export const feedRepository = {
  async getFeed(userId, page = 1, limit = 20) {
    try {
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      const { data: following } = await supabaseAdmin
        .from('follows')
        .select('following_id')
        .eq('follower_id', userId);

      const followingIds = new Set((following || []).map((f) => f.following_id));

      const { data: posts, error, count } = await supabaseAdmin
        .from('posts')
        .select(POST_SELECT, { count: 'exact' })
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      const activeUserIds = await getActiveUserIdSet();
      const visiblePosts = (posts || []).filter((post) => {
        const author = Array.isArray(post.user) ? post.user[0] : post.user;
        return author?.id && activeUserIds.has(author.id) && post.status === 'published';
      });

      const formattedPosts = await formatPostsList(visiblePosts, userId, followingIds);

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

  async getUserPosts(userId, includeDrafts = false, page = 1, limit = 20, viewerUserId = null) {
    try {
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      let query = supabaseAdmin
        .from('posts')
        .select(POST_SELECT, { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (!includeDrafts) {
        query = query.eq('status', 'published');
      }

      const { data: posts, error, count } = await query;
      if (error) throw error;

      const formattedPosts = await formatPostsList(posts, viewerUserId || userId);

      return {
        posts: formattedPosts,
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

  async getPublicUserPosts(targetUserId, viewerUserId = null, page = 1, limit = 20) {
    try {
      const { data: targetUser, error: targetUserError } = await supabaseAdmin
        .from('users')
        .select('id, account_status')
        .eq('id', targetUserId)
        .maybeSingle();

      if (targetUserError) throw targetUserError;
      if (!targetUser || targetUser.account_status !== 'active') {
        const err = new Error('Posts are private');
        err.statusCode = 404;
        throw err;
      }

      const isOwnProfile = viewerUserId === targetUserId;
      let canView = isOwnProfile;

      if (!canView) {
        const { data: settings } = await supabaseAdmin
          .from('user_settings')
          .select('is_public')
          .eq('user_id', targetUserId)
          .maybeSingle();

        const isPublic = settings?.is_public !== false;
        if (isPublic) {
          canView = true;
        } else if (viewerUserId) {
          canView = await followRepository.isFollowing(viewerUserId, targetUserId);
        }
      }

      if (!canView) {
        const err = new Error('Posts are private');
        err.statusCode = 403;
        throw err;
      }

      const from = (page - 1) * limit;
      const to = from + limit - 1;

      const { data: posts, error, count } = await supabaseAdmin
        .from('posts')
        .select(POST_SELECT, { count: 'exact' })
        .eq('user_id', targetUserId)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      const formattedPosts = await formatPostsList(posts, viewerUserId);

      return {
        posts: formattedPosts,
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      };
    } catch (error) {
      logger.error('Get public user posts error', { error: error.message });
      throw error;
    }
  },

  async getPostById(postId, viewerUserId = null) {
    const { data: post, error } = await supabaseAdmin
      .from('posts')
      .select(POST_SELECT)
      .eq('id', postId)
      .single();

    if (error) throw error;

    const author = Array.isArray(post.user) ? post.user[0] : post.user;
    if (post.status !== 'published') {
      const err = new Error('Post not found');
      err.statusCode = 404;
      throw err;
    }

    if (author?.id) {
      const { data: authorUser } = await supabaseAdmin
        .from('users')
        .select('account_status')
        .eq('id', author.id)
        .maybeSingle();
      if (!authorUser || authorUser.account_status !== 'active') {
        const err = new Error('Post not found');
        err.statusCode = 404;
        throw err;
      }
    }

    const [formatted] = await formatPostsList([post], viewerUserId);
    return formatted;
  },

  async getPostsByIds(postIds, viewerUserId = null) {
    const ids = [...new Set((postIds || []).filter(Boolean))];
    if (!ids.length) return new Map();

    const { data: posts, error } = await supabaseAdmin
      .from('posts')
      .select(POST_SELECT)
      .in('id', ids);

    if (error) throw error;
    const formatted = await formatPostsList(posts || [], viewerUserId);
    return new Map(formatted.map((post) => [post.id, post]));
  },

  async createPost(userId, content, imageUrl, status = 'published', tags = {}) {
    try {
      const { data, error } = await supabaseAdmin
        .from('posts')
        .insert({
          user_id: userId,
          content,
          image_url: imageUrl,
          status,
        })
        .select(POST_SELECT)
        .single();

      if (error) throw error;

      await savePostTags(
        data.id,
        tags.tagged_users || [],
        tags.tagged_books || []
      );

      const [formatted] = await formatPostsList([data], userId);
      return formatted;
    } catch (error) {
      logger.error('Create post error', { error: error.message });
      throw error;
    }
  },

  async updatePost(postId, userId, updates, tags) {
    try {
      const { data: existing, error: checkError } = await supabaseAdmin
        .from('posts')
        .select('user_id')
        .eq('id', postId)
        .single();

      if (checkError) throw checkError;
      if (existing.user_id !== userId) {
        throw new Error('Unauthorized');
      }

      const patch = { updated_at: new Date().toISOString() };
      if (updates.content !== undefined) patch.content = updates.content;
      if (updates.image_url !== undefined) patch.image_url = updates.image_url;
      if (updates.status !== undefined) patch.status = updates.status;

      const { data, error } = await supabaseAdmin
        .from('posts')
        .update(patch)
        .eq('id', postId)
        .select(POST_SELECT)
        .single();

      if (error) throw error;

      if (tags) {
        await savePostTags(postId, tags.tagged_users || [], tags.tagged_books || []);
      }

      const [formatted] = await formatPostsList([data], userId);
      return formatted;
    } catch (error) {
      logger.error('Update post error', { error: error.message });
      throw error;
    }
  },

  async deletePost(postId, userId) {
    try {
      const { data: existing, error: checkError } = await supabaseAdmin
        .from('posts')
        .select('user_id')
        .eq('id', postId)
        .single();

      if (checkError) throw checkError;
      if (existing.user_id !== userId) {
        throw new Error('Unauthorized');
      }

      const { error } = await supabaseAdmin.from('posts').delete().eq('id', postId);
      if (error) throw error;
      return { success: true };
    } catch (error) {
      logger.error('Delete post error', { error: error.message });
      throw error;
    }
  },

  async saveDraft(userId, content, imageUrl, tags = {}) {
    return feedRepository.createPost(userId, content, imageUrl, 'draft', tags);
  },

  async publishDraft(postId, userId) {
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('posts')
      .select('user_id, status, content, image_url')
      .eq('id', postId)
      .single();

    if (checkError) throw checkError;
    if (existing.user_id !== userId) {
      const err = new Error('Unauthorized');
      err.statusCode = 403;
      throw err;
    }
    if (existing.status !== 'draft') {
      const err = new Error('Only drafts can be published');
      err.statusCode = 400;
      throw err;
    }
    if (!existing.content?.trim() && !existing.image_url) {
      const err = new Error('Add text or an image before publishing');
      err.statusCode = 400;
      throw err;
    }

    return feedRepository.updatePost(postId, userId, { status: 'published' });
  },

  async updateDraft(postId, userId, content, imageUrl, tags = {}) {
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('posts')
      .select('user_id, status')
      .eq('id', postId)
      .single();

    if (checkError) throw checkError;
    if (existing.user_id !== userId) {
      const err = new Error('Unauthorized');
      err.statusCode = 403;
      throw err;
    }
    if (existing.status !== 'draft') {
      const err = new Error('Only drafts can be edited');
      err.statusCode = 400;
      throw err;
    }

    return feedRepository.updatePost(
      postId,
      userId,
      { content: content?.trim() || '', image_url: imageUrl ?? null },
      tags
    );
  },

  async incrementShareCount(postId) {
    const { data: post } = await supabaseAdmin
      .from('posts')
      .select('share_count')
      .eq('id', postId)
      .single();

    const next = (post?.share_count || 0) + 1;
    await supabaseAdmin
      .from('posts')
      .update({ share_count: next, updated_at: new Date().toISOString() })
      .eq('id', postId);

    return next;
  },

  async likePost(userId, postId) {
    try {
      const { error } = await supabaseAdmin.from('likes').insert({
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
