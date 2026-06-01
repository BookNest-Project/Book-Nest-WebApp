import express from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { authorStudioController } from '../controllers/authorStudioController.js';

const router = express.Router();

router.use(authenticate, requireRole(['author', 'publisher']));

router.get('/revenue-agreement', authorStudioController.getRevenueAgreement);
router.post('/revenue-agreement', authorStudioController.signRevenueAgreement);

export default router;
