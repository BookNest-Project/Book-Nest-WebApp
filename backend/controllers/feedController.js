import { feedRepository } from '../repositories/feedRepository.js';
import { commentRepository } from '../repositories/commentRepository.js';
import { reportRepository } from '../repositories/reportRepository.js';
import { fileUploadService } from '../services/fileUploadService.js';
import { notificationService } from '../services/notificationService.js';
import { formatSuccess } from '../utils/responseFormatter.js';
import { logger } from '../utils/logger.js';

function parseTags(body) {
  return {
    tagged_users: Array.isArray(body.tagged_users) ? body.tagged_users : [],
    tagged_books: Array.isArray(body.tagged_books) ? body.tagged_books : [],
  };
}

export const feedController = {
  async getFeed(req, res, next) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20 } = req.query;

      const result = await feedRepository.getFeed(userId, parseInt(page, 10), parseInt(limit, 10));

      res.status(200).json(formatSuccess(result, 'Feed retrieved'));
    } catch (error) {
      next(error);
    }
  },

  async getPostById(req, res, next) {
    try {
      const viewerId = req.user?.id || null;
      const post = await feedRepository.getPostById(req.params.postId, viewerId);
      res.status(200).json(formatSuccess(post, 'Post retrieved'));
    } catch (error) {
      next(error);
    }
  },

  async getUserPosts(req, res, next) {
    try {
      const userId = req.user.id;
      const { include_drafts = false, page = 1, limit = 20 } = req.query;

      const result = await feedRepository.getUserPosts(
        userId,
        include_drafts === 'true',
        parseInt(page, 10),
        parseInt(limit, 10),
        userId
      );

      res.status(200).json(formatSuccess(result, 'User posts retrieved'));
    } catch (error) {
      next(error);
    }
  },

  async getUserPublicPosts(req, res, next) {
    try {
      const { userId } = req.params;
      const viewerId = req.user?.id || null;
      const { page = 1, limit = 20 } = req.query;

      const result = await feedRepository.getPublicUserPosts(
        userId,
        viewerId,
        parseInt(page, 10),
        parseInt(limit, 10)
      );

      res.status(200).json(formatSuccess(result, 'User posts retrieved'));
    } catch (error) {
      if (error.statusCode === 403) {
        return res.status(403).json({ success: false, error: { message: error.message } });
      }
      next(error);
    }
  },

  async uploadPostImage(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: { message: 'No image uploaded' } });
      }

      const { url } = await fileUploadService.uploadPostImage(req.file, req.user.id);
      res.status(200).json(formatSuccess({ image_url: url }, 'Image uploaded'));
    } catch (error) {
      next(error);
    }
  },

  async createPost(req, res, next) {
    try {
      const userId = req.user.id;
      const { content, image_url } = req.body;
      const tags = parseTags(req.body);

      if (!content || !content.trim()) {
        return res.status(400).json({ success: false, error: { message: 'Content is required' } });
      }

      const post = await feedRepository.createPost(userId, content.trim(), image_url, 'published', tags);

      const authorName = post.author?.name || 'Someone you follow';
      void notificationService.notifyFollowersOfNewPost(userId, authorName).catch((err) => {
        logger.warn('Follower notification failed', { error: err.message });
      });

      res.status(201).json(formatSuccess(post, 'Post created'));
    } catch (error) {
      next(error);
    }
  },

  async saveDraft(req, res, next) {
    try {
      const userId = req.user.id;
      const { content, image_url } = req.body;
      const tags = parseTags(req.body);

      const draft = await feedRepository.saveDraft(
        userId,
        content?.trim() || '',
        image_url,
        tags
      );

      res.status(201).json(formatSuccess(draft, 'Draft saved'));
    } catch (error) {
      next(error);
    }
  },

  async publishDraft(req, res, next) {
    try {
      const userId = req.user.id;
      const { postId } = req.params;

      const post = await feedRepository.publishDraft(postId, userId);

      const authorName = post.author?.name || 'Someone you follow';
      void notificationService.notifyFollowersOfNewPost(userId, authorName).catch((err) => {
        logger.warn('Follower notification failed', { error: err.message });
      });

      res.status(200).json(formatSuccess(post, 'Draft published'));
    } catch (error) {
      if (error.statusCode === 400 || error.statusCode === 403) {
        return res.status(error.statusCode).json({ success: false, error: { message: error.message } });
      }
      next(error);
    }
  },

  async updateDraft(req, res, next) {
    try {
      const userId = req.user.id;
      const { postId } = req.params;
      const { content, image_url } = req.body;
      const tags = parseTags(req.body);

      const draft = await feedRepository.updateDraft(
        postId,
        userId,
        content,
        image_url,
        tags
      );

      res.status(200).json(formatSuccess(draft, 'Draft updated'));
    } catch (error) {
      if (error.statusCode === 400 || error.statusCode === 403) {
        return res.status(error.statusCode).json({ success: false, error: { message: error.message } });
      }
      next(error);
    }
  },

  async updatePost(req, res, next) {
    try {
      const userId = req.user.id;
      const { postId } = req.params;
      const { content, image_url, status } = req.body;
      const tags = req.body.tagged_users ? parseTags(req.body) : undefined;

      const post = await feedRepository.updatePost(
        postId,
        userId,
        { content, image_url, status },
        tags
      );

      res.status(200).json(formatSuccess(post, 'Post updated'));
    } catch (error) {
      next(error);
    }
  },

  async deletePost(req, res, next) {
    try {
      const userId = req.user.id;
      const { postId } = req.params;

      await feedRepository.deletePost(postId, userId);

      res.status(200).json(formatSuccess(null, 'Post deleted'));
    } catch (error) {
      next(error);
    }
  },

  async likePost(req, res, next) {
    try {
      const userId = req.user.id;
      const { postId } = req.params;

      await feedRepository.likePost(userId, postId);

      res.status(200).json(formatSuccess(null, 'Post liked'));
    } catch (error) {
      next(error);
    }
  },

  async unlikePost(req, res, next) {
    try {
      const userId = req.user.id;
      const { postId } = req.params;

      await feedRepository.unlikePost(userId, postId);

      res.status(200).json(formatSuccess(null, 'Post unliked'));
    } catch (error) {
      next(error);
    }
  },

  async sharePost(req, res, next) {
    try {
      const { postId } = req.params;
      const shareCount = await feedRepository.incrementShareCount(postId);
      res.status(200).json(formatSuccess({ shareCount }, 'Share recorded'));
    } catch (error) {
      next(error);
    }
  },

  async getComments(req, res, next) {
    try {
      const { postId } = req.params;
      const viewerId = req.user?.id || null;
      const comments = await commentRepository.getPostComments(postId, viewerId);
      res.status(200).json(formatSuccess({ comments }, 'Comments retrieved'));
    } catch (error) {
      next(error);
    }
  },

  async createComment(req, res, next) {
    try {
      const userId = req.user.id;
      const { postId } = req.params;
      const { content, parent_comment_id } = req.body;

      if (!content?.trim()) {
        return res.status(400).json({ success: false, error: { message: 'Comment is required' } });
      }

      const comment = await commentRepository.createComment(
        postId,
        userId,
        content,
        parent_comment_id || null
      );

      res.status(201).json(formatSuccess(comment, 'Comment added'));
    } catch (error) {
      next(error);
    }
  },

  async likeComment(req, res, next) {
    try {
      await commentRepository.likeComment(req.user.id, req.params.commentId);
      res.status(200).json(formatSuccess(null, 'Comment liked'));
    } catch (error) {
      next(error);
    }
  },

  async unlikeComment(req, res, next) {
    try {
      await commentRepository.unlikeComment(req.user.id, req.params.commentId);
      res.status(200).json(formatSuccess(null, 'Comment unliked'));
    } catch (error) {
      next(error);
    }
  },

  async createReport(req, res, next) {
    try {
      const { target_type, target_id, reason, details } = req.body;

      if (!target_type || !target_id || !reason) {
        return res.status(400).json({
          success: false,
          error: { message: 'target_type, target_id, and reason are required' },
        });
      }

      const report = await reportRepository.createReport(req.user.id, {
        target_type,
        target_id,
        reason,
        details,
      });

      res.status(201).json(formatSuccess(report, 'Report submitted'));
    } catch (error) {
      if (error.statusCode === 409) {
        return res.status(409).json({ success: false, error: { message: error.message } });
      }
      next(error);
    }
  },
};
