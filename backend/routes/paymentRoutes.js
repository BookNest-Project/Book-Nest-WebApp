import express from 'express';
import {
  initiatePayment,
  verifyPaymentWebhook,
  handlePaymentCallback,
  verifyPayment,
  checkOwnership,
  cleanupStuckPayments,
  getPurchaseStatus,
} from '../controllers/paymentController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      message: 'BookNest payments API',
      public: {
        callback: 'GET /api/payments/callback',
        webhook: 'POST /api/payments/webhook/chapa',
        cleanup: 'GET /api/payments/cleanup',
      },
      protected: {
        initiate: 'POST /api/payments/initiate',
        verify: 'POST /api/payments/verify',
        checkOwnership: 'POST /api/payments/check-ownership',
        purchaseStatus: 'GET /api/payments/purchase-status',
      },
      auth: 'Cookie token or Authorization: Bearer <token from login response>',
    },
  });
});

// Public payment callbacks
router.get('/callback', handlePaymentCallback);
router.post('/webhook/chapa', express.raw({ type: 'application/json' }), verifyPaymentWebhook);
router.get('/cleanup', cleanupStuckPayments);

// Protected payment routes (readers)
router.post('/initiate', authenticate, requireRole(['reader']), initiatePayment);
router.post('/verify', authenticate, verifyPayment);
router.post('/check-ownership', authenticate, checkOwnership);
router.get('/purchase-status', authenticate, getPurchaseStatus);

export default router;
