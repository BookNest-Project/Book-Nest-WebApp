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

async function sendVerificationEmailSafe(email, password, { isExistingUser = false } = {}) {
  try {
    await authRepository.sendVerificationEmailForUser(email, password, { isExistingUser });
    return { sent: true };
  } catch (error) {
    if (error.name === 'EMAIL_SEND_FAILED') {
      logger.error('Verification email failed', { email, error: error.message });
      return { sent: false, error: error.message };
    }
    throw error;
  }
}

function isFullyVerified(authUser, dbUser) {
  if (authUser && authRepository.isAuthEmailVerified(authUser)) return true;
  if (dbUser?.is_email_verified) return true;
  return false;
}

async function resolveRegistrationState(normalizedEmail) {
  let dbUser = await userRepository.findByEmail(normalizedEmail);
  let authUser = dbUser?.id ? await authRepository.getAuthUserById(dbUser.id) : null;

  if (!authUser) {
    authUser = await authRepository.resolveAuthUserByEmail(normalizedEmail);
    if (authUser) {
      await authRepository.ensurePublicUserRecord(authUser);
      dbUser = await userRepository.findById(authUser.id);
    }
  }

  return { dbUser, authUser };
}

async function resumeUnverifiedRegistration(userId, normalizedEmail, password, trimmedName) {
  await authRepository.updateUnverifiedUser(userId, password, {
    display_name: trimmedName,
    role: 'reader',
  });
  logger.info('Resuming incomplete registration', { userId, email: normalizedEmail });
}

export const authService = {
  /**
   * Public self-registration for readers only (no invitation).
   * If the email exists but is not verified, resume signup and resend verification.
   */
  async register(email, password, displayName) {
    const normalizedEmail = email.trim().toLowerCase();
    const trimmedName = displayName.trim();

    let { dbUser, authUser } = await resolveRegistrationState(normalizedEmail);

    if (isFullyVerified(authUser, dbUser)) {
      throw new ValidationError(
        'This email is already registered. Sign in instead, or use forgot password if you need help.'
      );
    }

    const resumeUserId = authUser?.id || dbUser?.id;
    if (await userRepository.isDisplayNameTaken(trimmedName, resumeUserId)) {
      throw new ValidationError('This display name is already taken');
    }

    let userId;
    let resumed = false;

    if (authUser) {
      userId = authUser.id;
      resumed = true;
      await resumeUnverifiedRegistration(userId, normalizedEmail, password, trimmedName);
      await authRepository.ensurePublicUserRecord(authUser);
    } else {
      try {
        const newAuthUser = await authRepository.signUpReader(normalizedEmail, password, {
          display_name: trimmedName,
          role: 'reader',
        });
        userId = newAuthUser.id;
        await authRepository.ensurePublicUserRecord(newAuthUser);
      } catch (error) {
        if (authRepository.isEmailAlreadyRegisteredError(error)) {
          authUser = await authRepository.resolveAuthUserByEmail(normalizedEmail);
          if (authUser && !authRepository.isAuthEmailVerified(authUser)) {
            userId = authUser.id;
            resumed = true;
            await resumeUnverifiedRegistration(userId, normalizedEmail, password, trimmedName);
            await authRepository.ensurePublicUserRecord(authUser);
          } else if (authUser && authRepository.isAuthEmailVerified(authUser)) {
            throw new ValidationError(
              'This email is already registered. Sign in instead, or use forgot password if you need help.'
            );
          } else {
            throw new ValidationError(
              'We could not complete signup for this email. Please try again or contact support.'
            );
          }
        } else {
          throw error;
        }
      }
    }

    try {
      await userRepository.upsertReaderProfile(userId, trimmedName);
    } catch (error) {
      if (error.message === 'DISPLAY_NAME_TAKEN') {
        throw new ValidationError('This display name is already taken');
      }
      throw error;
    }

    const emailResult = await sendVerificationEmailSafe(normalizedEmail, password, {
      isExistingUser: resumed,
    });

    if (!emailResult.sent) {
      return {
        message:
          resumed
            ? 'We updated your signup details but could not send the verification email. Use resend verification below.'
            : 'Account created. We could not send the verification email right now — use resend verification on the next screen.',
        email: normalizedEmail,
        resumed,
        verificationEmailPending: true,
      };
    }

    logger.info(resumed ? 'Registration resumed' : 'Reader registered successfully', {
      userId,
      email: normalizedEmail,
    });

    return {
      message: resumed
        ? 'You already started signing up — we sent a fresh verification email. Check your inbox.'
        : 'Verification email sent. Please check your inbox.',
      email: normalizedEmail,
      resumed,
    };
  },

  async login(email, password, rememberMe = false) {
    const normalizedEmail = email.trim().toLowerCase();
    const { user: authUser, session, error } = await authRepository.verifyCredentials(
      normalizedEmail,
      password
    );

    if (error || !authUser) {
      logger.warn('Login failed - invalid credentials', { email: normalizedEmail });
      throw new UnauthorizedError('Invalid email or password');
    }

    let dbUser = await userRepository.findByEmail(normalizedEmail);

    if (!dbUser) {
      await authRepository.ensurePublicUserRecord(authUser);
      dbUser = await userRepository.findByEmail(normalizedEmail);
    }

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

    let dbUser = await userRepository.findByEmail(authUser.email);
    if (!dbUser) {
      await authRepository.ensurePublicUserRecord(authUser);
      dbUser = await userRepository.findByEmail(authUser.email);
    }
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
    const normalizedEmail = email.trim().toLowerCase();
    const user = await userRepository.findByEmail(normalizedEmail);

    if (!user) {
      throw new NotFoundError('No account found with this email');
    }

    try {
      await authRepository.sendPasswordResetEmail(normalizedEmail);
    } catch (error) {
      if (error.name === 'EMAIL_SEND_FAILED') {
        throw new ValidationError(error.message);
      }
      throw error;
    }

    logger.info('Password reset email sent', { email: normalizedEmail, userId: user?.id });

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
    const normalizedEmail = email.trim().toLowerCase();
    let { dbUser, authUser } = await resolveRegistrationState(normalizedEmail);

    if (!dbUser && !authUser) {
      throw new ValidationError('No account found with this email');
    }

    if (isFullyVerified(authUser, dbUser)) {
      throw new ValidationError('Email already verified. Please sign in.');
    }

    const emailResult = await sendVerificationEmailSafe(normalizedEmail, undefined, {
      isExistingUser: true,
    });

    if (!emailResult.sent) {
      throw new ValidationError(
        emailResult.error ||
          'We could not send the verification email. Please try again in a few minutes.'
      );
    }

    logger.info('Verification email resent', {
      email: normalizedEmail,
      userId: dbUser?.id || authUser?.id,
    });

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
