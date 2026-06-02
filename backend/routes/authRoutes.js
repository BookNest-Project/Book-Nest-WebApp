import express from 'express';
import { authController } from '../controllers/authController.js';
import { authenticate, authenticateOptional } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/admin/login', authController.adminLogin);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.post('/resend-verification', authController.resendVerification);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/invite/preview', authController.invitePreview);
router.post('/invite/complete', authController.completeInvite);
router.post('/confirm-email', authController.confirmEmail);

// Session check — no token is normal for guests (register/login pages)
router.get('/me', authenticateOptional, authController.me);

export default router;