import express from 'express';
import { 
  register, 
  login, 
  getProfile, 
  updateProfile, 
  logout 
} from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { registerSchema } from '../middleware/validation.js';

const router = express.Router();

// Public routes (no authentication required)
router.post('/register', validate(registerSchema), register);
router.post('/login', login);

// Protected routes (require authentication)
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);
router.post('/logout', authenticate, logout);

export default router;