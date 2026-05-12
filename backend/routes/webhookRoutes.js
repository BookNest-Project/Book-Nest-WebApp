import express from 'express';
import { webhookController } from '../controllers/webhookController.js';

const router = express.Router();

// Health check endpoint (for Railway to verify service is running)
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Webhook endpoint - must use express.raw() to get raw body for signature verification
router.post(
  '/chapa',
  express.raw({ type: 'application/json' }),
  webhookController.handleChapaWebhook
);

export default router;