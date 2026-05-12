import express from 'express';
import { userController } from '../controllers/userController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.post('/register', userController.register);
router.post('/login', userController.login);
router.post('/logout', userController.logout);

// Protected routes (require authentication)
router.get('/me', authenticate, userController.me);
router.get('/profile', authenticate, userController.getProfile);
router.put('/profile', authenticate, userController.updateProfile);

// ✅ ADD THESE NEW ROUTES
router.post('/favorite-genres', authenticate, userController.saveFavoriteGenres);
router.get('/favorite-genres', authenticate, userController.getFavoriteGenres);

// Public routes (no authentication)
router.post('/forgot-password', userController.forgotPassword);
router.post('/update-password', userController.updatePassword);

export default router;