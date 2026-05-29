import { formatError } from '../utils/responseFormatter.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

export const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const isExpectedUnauthorized =
    statusCode === 401 &&
    (req.path === '/api/auth/me' || req.path === '/me') &&
    err.message === 'No token provided';

  if (isExpectedUnauthorized) {
    logger.debug('Unauthenticated session check', { path: req.path, method: req.method });
  } else if (err instanceof AppError && err.isOperational) {
    logger.warn('Request error', {
      path: req.path,
      method: req.method,
      error: err.message,
      statusCode,
    });
  } else {
    logger.error('Request error', {
      path: req.path,
      method: req.method,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }

  const response = formatError(err, statusCode);

  res.status(statusCode).json(response);
};

export const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      code: 'NOT_FOUND',
    },
  });
};