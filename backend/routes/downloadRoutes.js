import express from 'express';
import { downloadController } from '../controllers/downloadController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All download routes require authentication
router.use(authenticate);

router.get('/:bookFormatId', downloadController.downloadBook);

export default router;