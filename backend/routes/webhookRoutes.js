import express from 'express';
import { webhookController } from '../controllers/webhookController.js';

const router = express.Router();

// IMPORTANT: Use express.raw() to get the raw buffer, then parse manually
router.post(
  '/chapa', 
  express.raw({ type: 'application/json' }), 
  webhookController.handleChapaWebhook
);

router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;