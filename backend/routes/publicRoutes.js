import express from 'express';
import { profileController } from '../controllers/profileController.js';
import { authenticateOptional } from '../middleware/auth.js';

const router = express.Router();

router.get('/profile/:username', authenticateOptional, profileController.getPublicProfile);

export default router;