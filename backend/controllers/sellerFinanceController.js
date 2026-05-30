import { sellerFinanceService } from '../services/sellerFinanceService.js';
import { formatSuccess } from '../utils/responseFormatter.js';

function requireSellerRole(req, res) {
  if (req.user.role !== 'author' && req.user.role !== 'publisher') {
    res.status(403).json({
      success: false,
      error: { message: 'Only authors and publishers can access seller finance' },
    });
    return false;
  }
  return true;
}

export const sellerFinanceController = {
  async getWallet(req, res, next) {
    try {
      if (!requireSellerRole(req, res)) return;
      const wallet = await sellerFinanceService.getWallet(req.user.id);
      res.status(200).json(formatSuccess(wallet));
    } catch (error) {
      next(error);
    }
  },

  async getEarnings(req, res, next) {
    try {
      if (!requireSellerRole(req, res)) return;
      const earnings = await sellerFinanceService.getEarnings(req.user.id, {
        limit: parseInt(req.query.limit, 10) || 50,
        offset: parseInt(req.query.offset, 10) || 0,
      });
      res.status(200).json(formatSuccess(earnings));
    } catch (error) {
      next(error);
    }
  },

  async getEarningsSummary(req, res, next) {
    try {
      if (!requireSellerRole(req, res)) return;
      const summary = await sellerFinanceService.getEarningsSummary(req.user.id);
      res.status(200).json(formatSuccess(summary));
    } catch (error) {
      next(error);
    }
  },

  async getWithdrawals(req, res, next) {
    try {
      if (!requireSellerRole(req, res)) return;
      const rows = await sellerFinanceService.getWithdrawals(req.user.id);
      res.status(200).json(formatSuccess(rows));
    } catch (error) {
      next(error);
    }
  },

  async requestWithdrawal(req, res, next) {
    try {
      if (!requireSellerRole(req, res)) return;
      const { amount, payout_details } = req.body;
      if (!amount || !payout_details) {
        return res.status(400).json({
          success: false,
          error: { message: 'amount and payout_details are required' },
        });
      }
      const withdrawal = await sellerFinanceService.requestWithdrawal(
        req.user.id,
        req.user.email,
        { amount, payout_details }
      );
      res.status(201).json(formatSuccess(withdrawal, 'Withdrawal requested'));
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          error: { message: error.message },
        });
      }
      next(error);
    }
  },
};
