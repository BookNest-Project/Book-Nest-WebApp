import { formatSuccess } from '../utils/responseFormatter.js';
import { authorStudioService } from '../services/authorStudioService.js';

export const authorStudioController = {
  async getRevenueAgreement(req, res, next) {
    try {
      const data = await authorStudioService.getRevenueAgreementStatus(req.user.id);
      res.status(200).json(formatSuccess(data, 'Revenue agreement status'));
    } catch (error) {
      next(error);
    }
  },

  async signRevenueAgreement(req, res, next) {
    try {
      const data = await authorStudioService.signRevenueAgreement(req.user.id, req, {
        accepted: req.body?.accepted === true,
        signatureName: req.body?.signatureName || req.body?.signature_name,
      });
      const msg = data.notification?.email
        ? 'Revenue agreement signed — confirmation sent to your email'
        : data.notification?.notified
          ? 'Revenue agreement signed — you have been notified'
          : 'Revenue agreement signed';
      res.status(200).json(formatSuccess(data, msg));
    } catch (error) {
      next(error);
    }
  },

  async getBookSubmission(req, res, next) {
    try {
      const data = await authorStudioService.getBookSubmission(req.params.id, req.user.id);
      res.status(200).json(formatSuccess(data, 'Book submission retrieved'));
    } catch (error) {
      next(error);
    }
  },
};
