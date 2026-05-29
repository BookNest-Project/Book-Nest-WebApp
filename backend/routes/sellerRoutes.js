import express from 'express';
import { sellerController } from '../controllers/sellerController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Public profile (no auth required)
router.get('/:userId', sellerController.getSellerProfile);

// If you want protected version for private profiles, add with middleware
// router.use(authenticate);
// router.get('/private/:userId', sellerController.getPrivateSellerProfile);

export default router;