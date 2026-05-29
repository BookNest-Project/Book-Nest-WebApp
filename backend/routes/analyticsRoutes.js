import express from 'express';
import { analyticsController } from '../controllers/analyticsController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All analytics routes require authentication
router.use(authenticate);

router.get('/sales', analyticsController.getSalesAnalytics);

export default router;