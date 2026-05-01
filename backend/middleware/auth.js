import { supabase } from '../config/supabase.js';
import { UnauthorizedError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies?.token;

    if (!token) {
      throw new UnauthorizedError('No token provided');
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      logger.warn('Invalid token', { error: error?.message });
      throw new UnauthorizedError('Invalid or expired token');
    }

    req.user = {
      id: user.id,
      email: user.email,
    };

    next();
  } catch (error) {
    next(error);
  }
};

export const requireRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      const { userRepository } = await import('../repositories/userRepository.js');
      const dbUser = await userRepository.findById(req.user.id);

      if (!dbUser || !allowedRoles.includes(dbUser.role)) {
        throw new UnauthorizedError('Insufficient permissions');
      }

      req.user.role = dbUser.role;
      next();
    } catch (error) {
      next(error);
    }
  };
};