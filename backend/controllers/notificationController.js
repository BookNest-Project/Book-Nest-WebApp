import { notificationService } from '../services/notificationService.js';
import { notificationRepository } from '../repositories/notificationRepository.js';
import { formatSuccess } from '../utils/responseFormatter.js';

export const notificationController = {
  getVapidPublicKey(req, res) {
    const key = notificationService.getVapidPublicKey();
    res.status(200).json(formatSuccess({ publicKey: key }, 'VAPID public key'));
  },

  async list(req, res, next) {
    try {
      const page = parseInt(req.query.page || '1', 10);
      const limit = parseInt(req.query.limit || '20', 10);
      const unreadOnly = req.query.unreadOnly === 'true' || req.query.unread === '1';
      const result = await notificationRepository.list(req.user.id, page, limit, { unreadOnly });
      res.status(200).json(formatSuccess(result, 'Notifications retrieved'));
    } catch (error) {
      next(error);
    }
  },

  async getUnreadCount(req, res, next) {
    try {
      const count = await notificationRepository.getUnreadCount(req.user.id);
      res.status(200).json(formatSuccess({ count }, 'Unread count retrieved'));
    } catch (error) {
      next(error);
    }
  },

  async markAsRead(req, res, next) {
    try {
      await notificationRepository.markAsRead(req.params.id, req.user.id);
      res.status(200).json(formatSuccess(null, 'Notification marked as read'));
    } catch (error) {
      next(error);
    }
  },

  async markAllAsRead(req, res, next) {
    try {
      await notificationRepository.markAllAsRead(req.user.id);
      res.status(200).json(formatSuccess(null, 'All notifications marked as read'));
    } catch (error) {
      next(error);
    }
  },

  async subscribe(req, res, next) {
    try {
      const tz = Number.parseInt(req.body.timezone_offset_minutes, 10);
      await notificationService.saveSubscription(req.user.id, {
        endpoint: req.body.endpoint,
        keys: req.body.keys,
        timezone_offset_minutes: Number.isFinite(tz) ? tz : 0,
      });
      res.status(200).json(formatSuccess({ subscribed: true }, 'Push subscription saved'));
    } catch (error) {
      next(error);
    }
  },

  async unsubscribe(req, res, next) {
    try {
      const endpoint = req.body.endpoint;
      if (!endpoint) {
        return res.status(400).json({
          success: false,
          error: { message: 'endpoint is required' },
        });
      }
      await notificationService.removeSubscription(req.user.id, endpoint);
      res.status(200).json(formatSuccess({ unsubscribed: true }, 'Push subscription removed'));
    } catch (error) {
      next(error);
    }
  },
};
