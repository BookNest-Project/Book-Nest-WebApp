import { notificationService } from '../services/notificationService.js';
import { formatSuccess } from '../utils/responseFormatter.js';

export const notificationController = {
  getVapidPublicKey(req, res) {
    const key = notificationService.getVapidPublicKey();
    res.status(200).json(formatSuccess({ publicKey: key }, 'VAPID public key'));
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
