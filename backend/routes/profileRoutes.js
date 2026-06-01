import express from 'express';
import { profileController } from '../controllers/profileController.js';
import { authenticate } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

router.get('/profile', authenticate, profileController.getProfile);
router.put('/profile', authenticate, profileController.updateProfile);
router.post('/profile/avatar', authenticate, upload.single('avatar'), profileController.uploadAvatar);

export default router;
