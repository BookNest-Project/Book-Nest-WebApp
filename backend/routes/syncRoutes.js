import express from 'express';
import { syncController } from '../controllers/syncController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.post('/offline', syncController.processOfflineBatch);

export default router;
