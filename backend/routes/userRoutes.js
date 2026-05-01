import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  register,
  login,
  logout,
  me,
  getProfile,
  updateProfile,
} from '../controllers/userController.js';

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);

// Protected routes (require authentication)
router.get('/me', authenticate, me);
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);

export default router;