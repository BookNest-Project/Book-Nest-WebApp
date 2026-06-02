// backend/services/authService.js
import { userRepository } from '../repositories/userRepository.js';
import { authRepository } from '../repositories/authRepository.js';
import { profileRepository } from '../repositories/profileRepository.js';
import { supabase, supabaseAdmin } from '../config/supabase.js';
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
          'Account created. We could not send the verification email right now — use resend verification on the next screen.',
        email: normalizedEmail,
        resumed,
        verificationEmailPending: true,
        verificationEmailError: emailResult.error || null,
      };
    }

    logger.info(resumed ? 'Registration resumed' : 'Reader registered successfully', {
      userId,
      email: normalizedEmail,
    });

    return {
      message: 'Verification email sent. Please check your inbox.',
      email: normalizedEmail,
      resumed,
    };
  },

  async login(email, password, rememberMe = false, { adminOnly = false } = {}) {
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

    if (adminOnly && dbUser.role !== 'admin') {
      throw new ForbiddenError('This login is for admin accounts only.');
    }

    if (!adminOnly && dbUser.role === 'admin') {
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
      case 'admin':
        profile = await userRepository.findAdminProfile(authUser.id);
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

    const needsProfileSetup =
      (dbUser.role === 'author' && !profile?.pen_name) ||
      (dbUser.role === 'publisher' && !profile?.company_name);

    logger.info('User logged in successfully', { userId: dbUser.id, role: dbUser.role });

    return {
      token: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: expiresAtMs,
      rememberMe: !!rememberMe,
      needsGenreOnboarding,
      needsProfileSetup,
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

    if (!authUser.email_confirmed_at && !authUser.confirmed_at) {
      await authRepository.markEmailConfirmedInAuth(dbUser.id);
    }

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

  async getInvitePreview(accessToken) {
    const authUser = await authRepository.getUserFromAccessToken(accessToken);
    if (!authUser) {
      throw new ValidationError('This invitation link is invalid or has expired.');
    }

    const dbUser = await userRepository.findById(authUser.id);
    const role =
      dbUser?.role || authUser.app_metadata?.role || authUser.user_metadata?.role || null;

    if (!['author', 'publisher'].includes(role)) {
      throw new ValidationError('This invitation is only for author or publisher accounts.');
    }

    return {
      email: authUser.email,
      role,
      display_name: authUser.user_metadata?.display_name || null,
    };
  },

  async completeInviteRegistration(
    accessToken,
    newPassword,
    refreshToken,
    { pen_name, company_name, full_name } = {}
  ) {
    const previewUser = await authRepository.getUserFromAccessToken(accessToken);
    if (!previewUser) {
      throw new ValidationError('This invitation link is invalid or has expired.');
    }

    const dbUser = await userRepository.findById(previewUser.id);
    if (!dbUser) {
      throw new ValidationError('Account not found. Please contact support.');
    }

    if (!['author', 'publisher'].includes(dbUser.role)) {
      throw new ValidationError('This invitation is only for author or publisher accounts.');
    }

    if (dbUser.role === 'author' && !pen_name?.trim()) {
      throw new ValidationError('Pen name is required');
    }
    if (dbUser.role === 'publisher' && !company_name?.trim()) {
      throw new ValidationError('Company name is required');
    }

    const session = await authRepository.completeInviteRegistration(
      accessToken,
      newPassword,
      refreshToken
    );

    await authRepository.markEmailConfirmedInAuth(session.user.id);
    await userRepository.updateEmailVerification(
      session.user.id,
      true,
      new Date().toISOString()
    );

    await profileRepository.updateProfile(session.user.id, {
      pen_name: dbUser.role === 'author' ? pen_name.trim() : undefined,
      company_name: dbUser.role === 'publisher' ? company_name.trim() : undefined,
      full_name: full_name?.trim() || undefined,
    });

    await supabaseAdmin.auth.admin.updateUserById(session.user.id, {
      user_metadata: {
        ...previewUser.user_metadata,
        needs_profile_setup: false,
        pen_name: dbUser.role === 'author' ? pen_name.trim() : undefined,
        company_name: dbUser.role === 'publisher' ? company_name.trim() : undefined,
      },
    });

    let profile = null;
    if (dbUser.role === 'author') {
      profile = await userRepository.findAuthorProfile(session.user.id);
    } else {
      profile = await userRepository.findPublisherProfile(session.user.id);
    }

    const authSession = createAuthSession(dbUser, profile, SESSION_DURATION_DEFAULT_MS);

    logger.info('Invite registration completed', {
      userId: session.user.id,
      role: dbUser.role,
    });

    return {
      token: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: new Date(authSession.expiresAt).getTime(),
      rememberMe: false,
      needsGenreOnboarding: false,
      needsProfileSetup: false,
      session: authSession,
    };
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

  async getAuthContinuationFlags(userId) {
    const dbUser = await userRepository.findById(userId);
    if (!dbUser) {
      return { needsProfileSetup: false, needsGenreOnboarding: false };
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
      default:
        break;
    }

    const needsProfileSetup =
      (dbUser.role === 'author' && !profile?.pen_name) ||
      (dbUser.role === 'publisher' && !profile?.company_name);

    let needsGenreOnboarding = false;
    if (dbUser.role === 'reader') {
      const favoriteGenres = await userRepository.findFavoriteGenres(userId);
      needsGenreOnboarding = favoriteGenres.length === 0;
    }

    return { needsProfileSetup, needsGenreOnboarding };
  },

  async refreshAccessToken(refreshToken) {
    if (!refreshToken?.trim()) {
      throw new UnauthorizedError('Refresh token required');
    }

    const { session, error } = await authRepository.refreshSession(refreshToken.trim());

    if (error || !session?.access_token) {
      logger.warn('Token refresh failed', { error: error?.message });
      throw new UnauthorizedError('Session expired. Please sign in again.');
    }

    const { data: authUser, error: userError } = await supabase.auth.getUser(session.access_token);
    if (userError || !authUser?.user) {
      throw new UnauthorizedError('Session expired. Please sign in again.');
    }

    const dbUser = await userRepository.findById(authUser.user.id);
    if (!dbUser || dbUser.account_status !== 'active') {
      throw new UnauthorizedError('Account is not active');
    }

    return {
      token: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: session.expires_at
        ? new Date(session.expires_at).getTime()
        : Date.now() + SESSION_DURATION_DEFAULT_MS,
    };
  },
};
