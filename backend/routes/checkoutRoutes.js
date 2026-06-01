import express from 'express';
import { checkoutController } from '../controllers/checkoutController.js';
import { authenticate, authenticateOptional } from '../middleware/auth.js';

const router = express.Router();

// Chapa return_url may land before the session cookie is restored — verify by tx_ref only.
router.get('/verify', authenticateOptional, checkoutController.verifyPayment);

router.use(authenticate);

router.post('/', checkoutController.initializeCheckout);
router.get('/debug', checkoutController.debug);

export default router;