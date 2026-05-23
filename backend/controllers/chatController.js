import { chatRepository } from '../repositories/chatRepository.js';
import { formatSuccess } from '../utils/responseFormatter.js';
import { logger } from '../utils/logger.js';

export const chatController = {
  /**
   * Get or create direct chat with another user
   * POST /api/chat/direct
   */
  async getOrCreateDirectChat(req, res, next) {
    try {
      const userId = req.user.id;
      const { otherUserId } = req.body;

      if (!otherUserId) {
        return res.status(400).json({ error: 'otherUserId is required' });
      }

      const { chat, isNew } = await chatRepository.getOrCreateDirectChat(userId, otherUserId);

      res.status(200).json(formatSuccess({
        chat,
        isNew,
      }, 'Chat retrieved'));
    } catch (error) {
      next(error);
    }
  },

  /**
   * Create group chat
   * POST /api/chat/groups
   */
  async createGroupChat(req, res, next) {
    try {
      const userId = req.user.id;
      const { name, memberIds } = req.body;

      if (!name || !memberIds || !Array.isArray(memberIds)) {
        return res.status(400).json({ error: 'name and memberIds array are required' });
      }

      const chat = await chatRepository.createGroupChat(name, userId, memberIds);

      res.status(201).json(formatSuccess(chat, 'Group chat created'));
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get all chats for current user
   * GET /api/chat
   */
  async getUserChats(req, res, next) {
    try {
      const userId = req.user.id;
      const chats = await chatRepository.getUserChats(userId);

      res.status(200).json(formatSuccess(chats, 'Chats retrieved'));
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get messages for a chat
   * GET /api/chat/:chatId/messages
   */
  async getChatMessages(req, res, next) {
    try {
      const userId = req.user.id;
      const { chatId } = req.params;
      const { page = 1, limit = 50 } = req.query;

      const result = await chatRepository.getChatMessages(
        chatId,
        userId,
        parseInt(page),
        parseInt(limit)
      );

      res.status(200).json(formatSuccess(result, 'Messages retrieved'));
    } catch (error) {
      next(error);
    }
  },

  /**
   * Send message
   * POST /api/chat/:chatId/messages
   */
  async sendMessage(req, res, next) {
    try {
      const userId = req.user.id;
      const { chatId } = req.params;
      const { content } = req.body;

      if (!content || !content.trim()) {
        return res.status(400).json({ error: 'Content is required' });
      }

      const message = await chatRepository.sendMessage(chatId, userId, content);

      res.status(201).json(formatSuccess(message, 'Message sent'));
    } catch (error) {
      next(error);
    }
  },

  /**
   * Add member to group chat
   * POST /api/chat/:chatId/members
   */
  async addGroupMember(req, res, next) {
    try {
      const userId = req.user.id;
      const { chatId } = req.params;
      const { memberId } = req.body;

      if (!memberId) {
        return res.status(400).json({ error: 'memberId is required' });
      }

      await chatRepository.addGroupMember(chatId, userId, memberId);

      res.status(200).json(formatSuccess(null, 'Member added'));
    } catch (error) {
      next(error);
    }
  },

  /**
   * Remove member from group chat
   * DELETE /api/chat/:chatId/members/:memberId
   */
  async removeGroupMember(req, res, next) {
    try {
      const userId = req.user.id;
      const { chatId, memberId } = req.params;

      await chatRepository.removeGroupMember(chatId, userId, memberId);

      res.status(200).json(formatSuccess(null, 'Member removed'));
    } catch (error) {
      next(error);
    }
  },
};