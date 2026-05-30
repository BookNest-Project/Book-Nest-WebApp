import express from 'express';
import { sellerController } from '../controllers/sellerController.js';
import { sellerFinanceController } from '../controllers/sellerFinanceController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/wallet', authenticate, sellerFinanceController.getWallet);
router.get('/earnings/summary', authenticate, sellerFinanceController.getEarningsSummary);
router.get('/earnings', authenticate, sellerFinanceController.getEarnings);
router.get('/withdrawals', authenticate, sellerFinanceController.getWithdrawals);
router.post('/withdrawals', authenticate, sellerFinanceController.requestWithdrawal);

// Public seller profile
router.get('/:userId', sellerController.getSellerProfile);

export default router;
