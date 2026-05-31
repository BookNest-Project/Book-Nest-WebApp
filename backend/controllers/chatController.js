import { chatRepository } from '../repositories/chatRepository.js';
import { notificationService } from '../services/notificationService.js';
import { logger } from '../utils/logger.js';
import { formatSuccess } from '../utils/responseFormatter.js';

export const chatController = {
  async getOrCreateDirectChat(req, res, next) {
    try {
      const userId = req.user.id;
      const { otherUserId } = req.body;

      if (!otherUserId) {
        return res.status(400).json({ error: 'otherUserId is required' });
      }

      const { chat, isNew } = await chatRepository.getOrCreateDirectChat(userId, otherUserId);

      res.status(200).json(formatSuccess({ chat, isNew }, 'Chat retrieved'));
    } catch (error) {
      next(error);
    }
  },

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

  async getUserChats(req, res, next) {
    try {
      const chats = await chatRepository.getUserChats(req.user.id);
      res.status(200).json(formatSuccess(chats, 'Chats retrieved'));
    } catch (error) {
      next(error);
    }
  },

  async getChatById(req, res, next) {
    try {
      const chat = await chatRepository.getChatById(req.params.chatId, req.user.id);
      res.status(200).json(formatSuccess(chat, 'Chat retrieved'));
    } catch (error) {
      if (error.message === 'Not a participant') {
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  },

  async getChatMessages(req, res, next) {
    try {
      const { chatId } = req.params;
      const { page = 1, limit = 50 } = req.query;

      const result = await chatRepository.getChatMessages(
        chatId,
        req.user.id,
        parseInt(page, 10),
        parseInt(limit, 10)
      );

      res.status(200).json(formatSuccess(result, 'Messages retrieved'));
    } catch (error) {
      if (error.message === 'Not a participant') {
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  },

  async sendMessage(req, res, next) {
    try {
      const { chatId } = req.params;
      const { content } = req.body;
      const postId = req.body.postId || req.body.post_id || null;

      if ((!content || !content.trim()) && !postId) {
        return res.status(400).json({ error: 'Content or postId is required' });
      }

      const message = await chatRepository.sendMessage(
        chatId,
        req.user.id,
        content?.trim() || '',
        postId
      );

      void notificationService
        .notifyNewMessage({
          chatId,
          senderId: req.user.id,
          content: content?.trim() || '',
          postId,
        })
        .catch((err) => {
          logger.warn('Message notification failed', { error: err.message });
        });

      res.status(201).json(formatSuccess(message, 'Message sent'));
    } catch (error) {
      if (error.message === 'Not a participant') {
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  },

  async deleteMessageForMe(req, res, next) {
    try {
      await chatRepository.deleteMessageForMe(req.params.messageId, req.user.id);
      res.status(200).json(formatSuccess(null, 'Message deleted for you'));
    } catch (error) {
      next(error);
    }
  },

  async deleteMessageForEveryone(req, res, next) {
    try {
      await chatRepository.deleteMessageForEveryone(req.params.messageId, req.user.id);
      res.status(200).json(formatSuccess(null, 'Message deleted for everyone'));
    } catch (error) {
      if (error.message === 'Only the sender can delete for everyone') {
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  },

  async createGroupInvite(req, res, next) {
    try {
      const invite = await chatRepository.createGroupInvite(req.params.chatId, req.user.id);
      res.status(201).json(formatSuccess(invite, 'Invite link created'));
    } catch (error) {
      if (error.message === 'Not a group chat' || error.message === 'Not a participant') {
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  },

  async joinGroupViaInvite(req, res, next) {
    try {
      const { token } = req.params;
      const chat = await chatRepository.joinGroupViaInvite(token, req.user.id);
      res.status(200).json(formatSuccess(chat, 'Joined group'));
    } catch (error) {
      if (
        error.message === 'Invalid or expired invite' ||
        error.message === 'Invite link has expired'
      ) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  },

  async addGroupMember(req, res, next) {
    try {
      const { chatId } = req.params;
      const { memberId } = req.body;

      if (!memberId) {
        return res.status(400).json({ error: 'memberId is required' });
      }

      await chatRepository.addGroupMember(chatId, req.user.id, memberId);
      res.status(200).json(formatSuccess(null, 'Member added'));
    } catch (error) {
      next(error);
    }
  },

  async removeGroupMember(req, res, next) {
    try {
      const { chatId, memberId } = req.params;
      await chatRepository.removeGroupMember(chatId, req.user.id, memberId);
      res.status(200).json(formatSuccess(null, 'Member removed'));
    } catch (error) {
      next(error);
    }
  },
};
