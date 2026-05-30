import express from 'express';
import { analyticsController } from '../controllers/analyticsController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All analytics routes require authentication
router.use(authenticate);

router.get('/sales', analyticsController.getSalesAnalytics);
router.get('/sales/report', analyticsController.getSalesReport);
router.get('/performance', analyticsController.getBookPerformance);
router.get('/reviews', analyticsController.getSellerReviews);

export default router;