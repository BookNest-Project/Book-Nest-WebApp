import { userRepository } from '../repositories/userRepository.js';
import { UnauthorizedError, ValidationError } from '../utils/errors.js';
import { createAuthSession, formatSessionUser } from '../utils/responseFormatter.js';
import { logger } from '../utils/logger.js';

export const authService = {
  async register(email, password, displayName) {
    // Validate input
    if (!email || !password || !displayName) {
      throw new ValidationError('Email, password, and display name are required');
    }

    if (password.length < 6) {
      throw new ValidationError('Password must be at least 6 characters');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ValidationError('Invalid email format');
    }

    // Create user
    const authUser = await userRepository.createAuthUser(email, password, displayName);
    
    logger.info('User registered successfully', { userId: authUser.id, email });

    // Return the user - the controller will handle auto-login
    return { user: authUser };
  },

  async login(email, password) {
    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    const { user: authUser, session, error } = await userRepository.verifyCredentials(email, password);

    if (error || !authUser) {
      logger.warn('Login failed', { email, error: error?.message });
      throw new UnauthorizedError('Invalid email or password');
    }

    // Get full user data from database
    const dbUser = await userRepository.findById(authUser.id);
    
    if (!dbUser) {
      throw new UnauthorizedError('User account not found');
    }

    if (dbUser.account_status !== 'active') {
      throw new UnauthorizedError('Account is not active');
    }

    let profile = null;
    switch (dbUser.role) {
      case 'reader':
        profile = await userRepository.findReaderProfile(authUser.id);
        break;
      case 'author':
        profile = await userRepository.findAuthorProfile(authUser.id);
        break;
      case 'publisher':
        profile = await userRepository.findPublisherProfile(authUser.id);
        break;
      case 'admin':
        profile = await userRepository.findAdminProfile(authUser.id);
        break;
    }

    logger.info('User logged in successfully', { userId: authUser.id, role: dbUser.role });

    return {
      token: session.access_token,
      refreshToken: session.refresh_token,
      session: createAuthSession(dbUser, profile),
    };
  },

  async getUserSession(userId) {
    const dbUser = await userRepository.findById(userId);
    
    if (!dbUser) {
      throw new UnauthorizedError('User not found');
    }

    let profile = null;
    switch (dbUser.role) {
      case 'reader':
        profile = await userRepository.findReaderProfile(userId);
        break;
      case 'author':
        profile = await userRepository.findAuthorProfile(userId);
        break;
      case 'publisher':
        profile = await userRepository.findPublisherProfile(userId);
        break;
      case 'admin':
        profile = await userRepository.findAdminProfile(userId);
        break;
    }

    return createAuthSession(dbUser, profile);
  },

  logout() {
    logger.info('User logged out');
    return true;
  },
};