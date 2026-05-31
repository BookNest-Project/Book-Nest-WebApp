import { feedRepository } from '../repositories/feedRepository.js';
import { formatSuccess } from '../utils/responseFormatter.js';
import { logger } from '../utils/logger.js';

export const feedController = {
  async getFeed(req, res, next) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20 } = req.query;
      
      const result = await feedRepository.getFeed(userId, parseInt(page), parseInt(limit));
      
      res.status(200).json(formatSuccess(result, 'Feed retrieved'));
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
        parseInt(page), 
        parseInt(limit)
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

  async createPost(req, res, next) {
    try {
      const userId = req.user.id;
      const { content, image_url } = req.body;
      
      if (!content || !content.trim()) {
        return res.status(400).json({ error: 'Content is required' });
      }
      
      const post = await feedRepository.createPost(userId, content, image_url);
      
      res.status(201).json(formatSuccess(post, 'Post created'));
    } catch (error) {
      next(error);
    }
  },

  async saveDraft(req, res, next) {
    try {
      const userId = req.user.id;
      const { content, image_url } = req.body;
      
      const draft = await feedRepository.saveDraft(userId, content, image_url);
      
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
      
      res.status(200).json(formatSuccess(post, 'Draft published'));
    } catch (error) {
      next(error);
    }
  },

  async updatePost(req, res, next) {
    try {
      const userId = req.user.id;
      const { postId } = req.params;
      const { content, image_url, status } = req.body;
      
      const post = await feedRepository.updatePost(postId, userId, { content, image_url, status });
      
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
};