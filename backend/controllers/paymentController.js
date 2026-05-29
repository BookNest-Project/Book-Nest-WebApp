import { supabaseAdmin } from '../config/supabase.js';
import { formatSuccess } from '../utils/responseFormatter.js';
import { logger } from '../utils/logger.js';
import {
  getOwnedFormatIds,
  isOwnBook,
} from '../utils/purchaseValidation.js';
import { ValidationError } from '../utils/errors.js';

export const initiatePayment = async (req, res, next) => {
  try {
    res.json(formatSuccess({ message: 'Payment initiation not implemented yet' }));
  } catch (error) {
    next(error);
  }
};

export const verifyPaymentWebhook = async (req, res, next) => {
  try {
    res.json(formatSuccess({ message: 'Webhook verification not implemented yet' }));
  } catch (error) {
    next(error);
  }
};

export const handlePaymentCallback = async (req, res, next) => {
  try {
    res.json(formatSuccess({ message: 'Callback handling not implemented yet' }));
  } catch (error) {
    next(error);
  }
};

export const verifyPayment = async (req, res, next) => {
  try {
    res.json(formatSuccess({ message: 'Payment verification not implemented yet' }));
  } catch (error) {
    next(error);
  }
};

export const checkOwnership = async (req, res, next) => {
  try {
    res.json(formatSuccess({ message: 'Ownership check not implemented yet' }));
  } catch (error) {
    next(error);
  }
};

export const getPurchasedBooks = async (req, res, next) => {
  try {
    res.json(formatSuccess({ message: 'Get purchased books not implemented yet' }));
  } catch (error) {
    next(error);
  }
};

export const cleanupStuckPayments = async (req, res, next) => {
  try {
    res.json(formatSuccess({ message: 'Cleanup not implemented yet' }));
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/payments/purchase-status?book_id=uuid
 */
export const getPurchaseStatus = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const bookId = req.query.book_id;

    if (!bookId) {
      throw new ValidationError('book_id is required');
    }

    const { data: book, error: bookError } = await supabaseAdmin
      .from('books')
      .select('id, uploaded_by, author_user_id, status, is_active')
      .eq('id', bookId)
      .single();

    if (bookError || !book) {
      return res.status(404).json({
        success: false,
        error: { message: 'Book not found' },
      });
    }

    const { data: formats, error: formatsError } = await supabaseAdmin
      .from('book_formats')
      .select('id')
      .eq('book_id', bookId)
      .eq('is_active', true);

    if (formatsError) {
      throw formatsError;
    }

    const formatIds = (formats || []).map((f) => f.id);
    const ownedSet = await getOwnedFormatIds(userId, formatIds);

    res.status(200).json(
      formatSuccess(
        {
          isOwnBook: isOwnBook(userId, book),
          ownedFormatIds: [...ownedSet],
        },
        'Purchase status retrieved'
      )
    );
  } catch (error) {
    next(error);
  }
};
