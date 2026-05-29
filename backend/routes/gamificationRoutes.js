import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { gamificationController } from '../controllers/gamificationController.js';

const router = express.Router();

router.use(authenticate);
router.get('/me', gamificationController.getMe);

export default router;
