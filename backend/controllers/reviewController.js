import { reviewService } from '../services/reviewService.js';
import { formatSuccess } from '../utils/responseFormatter.js';

export const reviewController = {
  async listReviews(req, res, next) {
    try {
      const reviews = await reviewService.listForBook(req.params.id);
      res.status(200).json(formatSuccess(reviews));
    } catch (error) {
      next(error);
    }
  },

  async createReview(req, res, next) {
    try {
      const { rating, body } = req.body;
      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          error: { message: 'rating must be between 1 and 5' },
        });
      }
      const review = await reviewService.createReview(
        req.user.id,
        req.user.role,
        req.params.id,
        { rating, body }
      );
      res.status(201).json(formatSuccess(review, 'Review created'));
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

  async canReview(req, res, next) {
    try {
      const can = await reviewService.canReview(req.user.id, req.params.id);
      const existing = can
        ? await reviewService.getUserReviewForBook(req.user.id, req.params.id)
        : null;
      res.status(200).json(formatSuccess({ can_review: can && !existing, existing_review: existing }));
    } catch (error) {
      next(error);
    }
  },
};
