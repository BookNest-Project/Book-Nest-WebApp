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
import { loginSchema, profileUpdateSchema, registerSchema } from '../middleware/validation.js';

const router = express.Router();

// Public routes (no authentication required)
router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);

// Protected routes (require authentication)
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, validate(profileUpdateSchema), updateProfile);
router.post('/logout', authenticate, logout);

export default router;
