import express from 'express';
import { checkoutController } from '../controllers/checkoutController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.post('/', checkoutController.initializeCheckout);
router.get('/verify', checkoutController.verifyPayment);  // Make sure this exists
router.get('/debug', checkoutController.debug);

export default router;