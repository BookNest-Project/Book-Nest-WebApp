import express from 'express';
import { profileController } from '../controllers/profileController.js';
import { authenticate } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.get('/', profileController.getProfile);
router.put('/', profileController.updateProfile);
router.post('/avatar', upload.single('avatar'), profileController.updateAvatar);
router.put('/settings', profileController.updateSettings);
router.delete('/account', profileController.deleteAccount);

// Public profile (no auth required, but we'll handle separately)
// This route should be outside this router if no auth needed
export default router;