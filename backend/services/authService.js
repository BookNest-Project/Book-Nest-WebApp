// backend/services/authService.js
import { userRepository } from '../repositories/userRepository.js';
import { authRepository } from '../repositories/authRepository.js';
import { supabaseAdmin } from '../config/supabase.js';
import { UnauthorizedError, ValidationError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import {
  createAuthSession,
  SESSION_DURATION_DEFAULT_MS,
  SESSION_DURATION_REMEMBER_MS,
} from '../utils/responseFormatter.js';

export const authService = {
  /**
   * Public self-registration for readers only (no invitation).
   */
  async register(email, password, displayName) {
    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      throw new ValidationError('Email already registered');
    }

    const trimmedName = displayName.trim();
    if (await userRepository.isDisplayNameTaken(trimmedName)) {
      throw new ValidationError('This display name is already taken');
    }

    let authUser;
    try {
      authUser = await authRepository.signUpReader(email, password, {
        display_name: trimmedName,
        role: 'reader',
      });
    } catch (error) {
      if (error.message === 'EMAIL_ALREADY_REGISTERED') {
        throw new ValidationError('Email already registered');
      }
      if (error.name === 'EMAIL_SEND_FAILED') {
        throw new ValidationError(
          'We could not send the verification email. Check your inbox later or use resend verification after fixing SMTP settings.'
        );
      }
      throw error;
    }

    try {
      await userRepository.upsertReaderProfile(authUser.id, trimmedName);
    } catch (error) {
      if (error.message === 'DISPLAY_NAME_TAKEN') {
        throw new ValidationError('This display name is already taken');
      }
      throw error;
    }

    logger.info('Reader registered successfully', { userId: authUser.id, email });

    return {
      message: 'Verification email sent. Please check your inbox.',
      email: authUser.email,
    };
  },

  async login(email, password, rememberMe = false) {
    const { user: authUser, session, error } = await authRepository.verifyCredentials(email, password);

    if (error || !authUser) {
      logger.warn('Login failed - invalid credentials', { email });
      throw new UnauthorizedError('Invalid email or password');
    }

    let dbUser = await userRepository.findByEmail(email);

    if (!dbUser) {
      throw new UnauthorizedError('User account not found');
    }

    if (dbUser.role === 'admin') {
      throw new ForbiddenError('Unable to sign in with this account.');
    }

    if (dbUser.account_status !== 'active') {
      throw new ForbiddenError('Your account has been suspended. Please contact support.');
    }

    const confirmedAt = authUser.email_confirmed_at || authUser.confirmed_at;
    if (confirmedAt && !dbUser.is_email_verified) {
      await userRepository.updateEmailVerification(dbUser.id, true, confirmedAt);
      dbUser = { ...dbUser, is_email_verified: true };
    }

    if (!dbUser.is_email_verified) {
      throw new ForbiddenError(
        'Please verify your email before logging in. Check your inbox for the verification link.'
      );
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
      default:
        break;
    }

    const durationMs = rememberMe
      ? SESSION_DURATION_REMEMBER_MS
      : SESSION_DURATION_DEFAULT_MS;

    const authSession = createAuthSession(dbUser, profile, durationMs);
    const expiresAtMs = new Date(authSession.expiresAt).getTime();

    let needsGenreOnboarding = false;
    if (dbUser.role === 'reader') {
      const favoriteGenres = await userRepository.findFavoriteGenres(dbUser.id);
      needsGenreOnboarding = favoriteGenres.length === 0;
    }

    logger.info('User logged in successfully', { userId: dbUser.id, role: dbUser.role });

    return {
      token: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: expiresAtMs,
      rememberMe: !!rememberMe,
      needsGenreOnboarding,
      session: authSession,
    };
  },

  async confirmEmail(accessToken) {
    const authUser = await authRepository.getUserFromAccessToken(accessToken);
    if (!authUser) {
      throw new ValidationError('Invalid or expired verification link. Please request a new one.');
    }

    const dbUser = await userRepository.findByEmail(authUser.email);
    if (!dbUser) {
      throw new ValidationError('Account not found. Please register again.');
    }

    const confirmedAt =
      authUser.email_confirmed_at || authUser.confirmed_at || new Date().toISOString();

    await userRepository.updateEmailVerification(dbUser.id, true, confirmedAt);

    logger.info('Email confirmed via link', { userId: dbUser.id, email: dbUser.email });

    return {
      message: 'Email verified successfully. You can now sign in.',
      email: dbUser.email,
    };
  },

  async forgotPassword(email) {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new NotFoundError('No account found with this email');
    }

    try {
      await authRepository.sendPasswordResetEmail(email);
    } catch (error) {
      if (error.name === 'EMAIL_SEND_FAILED') {
        throw new ValidationError(error.message);
      }
      throw error;
    }

    logger.info('Password reset email sent', { email, userId: user.id });

    return { message: 'Password reset link sent. Check your inbox.' };
  },

  async resetPassword(accessToken, newPassword, refreshToken = null) {
    try {
      await authRepository.resetPassword(accessToken, newPassword, refreshToken);
    } catch (error) {
      const message = error?.message || 'Failed to reset password';
      if (error?.name === 'RATE_LIMIT') {
        throw new ValidationError(message);
      }
      if (message.toLowerCase().includes('expired') || message.toLowerCase().includes('invalid')) {
        throw new ValidationError(message);
      }
      throw new ValidationError(message);
    }
    return { message: 'Password updated successfully. You can now login with your new password.' };
  },

  async resendVerification(email) {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new ValidationError('No account found with this email');
    }

    if (user.is_email_verified) {
      throw new ValidationError('Email already verified. Please login.');
    }

    try {
      await authRepository.resendVerificationEmail(email);
    } catch (error) {
      if (error.name === 'EMAIL_SEND_FAILED') {
        throw new ValidationError(error.message);
      }
      throw error;
    }

    logger.info('Verification email resent', { email, userId: user.id });

    return { message: 'Verification email resent. Please check your inbox.' };
  },

  async logout(token) {
    await authRepository.signOut(token);
    logger.info('User logged out');
    return true;
  },

  async getCurrentUser(userId) {
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
      default:
        break;
    }

    // Fallback: older accounts might not have a profile row yet, but Supabase Auth metadata does.
    // Use it so the UI doesn't show the email prefix as the "name".
    if (
      !profile ||
      (dbUser.role === 'reader' && !profile.display_name) ||
      (dbUser.role === 'author' && !profile.pen_name) ||
      (dbUser.role === 'publisher' && !profile.company_name) ||
      (dbUser.role === 'admin' && !profile.display_name)
    ) {
      try {
        const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (!error && data?.user) {
          const meta = data.user.user_metadata || {};
          if (dbUser.role === 'reader' && meta.display_name) {
            profile = { ...(profile || {}), display_name: meta.display_name };
          }
          if (dbUser.role === 'author' && (meta.pen_name || meta.display_name)) {
            profile = { ...(profile || {}), pen_name: meta.pen_name || meta.display_name };
          }
          if (dbUser.role === 'publisher' && (meta.company_name || meta.display_name)) {
            profile = { ...(profile || {}), company_name: meta.company_name || meta.display_name };
          }
          if (dbUser.role === 'admin' && meta.display_name) {
            profile = { ...(profile || {}), display_name: meta.display_name };
          }
        }
      } catch (err) {
        logger.warn('Auth metadata fallback failed', { userId, error: err?.message });
      }
    }

    return createAuthSession(dbUser, profile, SESSION_DURATION_DEFAULT_MS);
  },
};
