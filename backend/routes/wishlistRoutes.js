import express from 'express';
import { wishlistController } from '../controllers/wishlistController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All wishlist routes require authentication
router.use(authenticate);

router.get('/', wishlistController.getWishlist);
router.get('/count', wishlistController.getWishlistCount);
router.get('/:bookId/check', wishlistController.isInWishlist);
router.post('/', wishlistController.addToWishlist);
router.delete('/:bookId', wishlistController.removeFromWishlist);

export default router;