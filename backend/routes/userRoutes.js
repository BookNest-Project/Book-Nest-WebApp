import express from 'express';
import { userController } from '../controllers/userController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Protected routes (require authentication)
router.get('/search', authenticate, userController.searchUsers);

router.get('/profile', authenticate, userController.getProfile);
router.put('/profile', authenticate, userController.updateProfile);


// ✅ ADD THESE NEW ROUTES
router.post('/favorite-genres', authenticate, userController.saveFavoriteGenres);
router.get('/favorite-genres', authenticate, userController.getFavoriteGenres);
router.post('/presence', authenticate, userController.updatePresence);

// Public routes (no authentication) 


export default router;