import express from 'express';
import { progressController } from '../controllers/progressController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.post('/sync', progressController.syncProgress);
router.get('/', progressController.getAllProgress);
router.get('/:bookFormatId', progressController.getProgressForFormat);

export default router;
