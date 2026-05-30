import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { notificationController } from '../controllers/notificationController.js';

const router = express.Router();

router.get('/vapid-public-key', notificationController.getVapidPublicKey);
router.use(authenticate);
router.post('/subscribe', notificationController.subscribe);
router.post('/unsubscribe', notificationController.unsubscribe);

export default router;
