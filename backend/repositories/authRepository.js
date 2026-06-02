// backend/repositories/authRepository.js
import { supabase, supabaseAdmin } from '../config/supabase.js';
import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';
import { getFrontendUrl } from '../utils/envUrls.js';
import { userRepository } from './userRepository.js';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  assertEmailSent,
} from '../services/emailService.js';
import {
  sendVerificationViaSupabase,
  sendPasswordResetViaSupabase,
  signUpReaderViaSupabasePublic,
} from '../services/supabaseAuthEmail.js';
import {
  shouldUseSupabaseAuthMailerFirst,
  shouldTrySupabaseAuthMailerFallback,
  shouldRegisterViaPublicSupabaseSignUp,
} from '../services/authEmailPolicy.js';

function getAuthCallbackUrl(intent) {
  const base = `${getFrontendUrl()}/auth/callback`;
  return intent ? `${base}?intent=${encodeURIComponent(intent)}` : base;
}

function getEmailVerificationRedirectUrl() {
  return getAuthCallbackUrl('verify');
}

function getPasswordResetRedirectUrl() {
  return getAuthCallbackUrl('recovery');
}

function getInviteRegistrationRedirectUrl() {
  return `${getFrontendUrl()}/register/invite`;
}

function mapSupabaseAuthError(error) {
  const message = error?.message?.toLowerCase() || '';
  if (message.includes('rate limit')) {
    const err = new Error(
      'Too many emails sent. Please wait a few minutes before trying again.'
    );
    err.name = 'RATE_LIMIT';
    return err;
  }
  return error;
}

function isEmailAlreadyRegisteredError(error) {
  if (error?.message === 'EMAIL_ALREADY_REGISTERED') return true;
  const message = error?.message?.toLowerCase() || '';
  return (
    error?.status === 422 ||
    message.includes('already been registered') ||
    message.includes('already registered')
  );
}

async function generateAuthLink(type, email, { redirectTo, password } = {}) {
  const payload = {
    type,
    email,
    options: { redirectTo },
  };

  if (password) {
    payload.password = password;
  }

  const { data, error } = await supabaseAdmin.auth.admin.generateLink(payload);

  if (error) {
    logger.error('generateLink failed', { type, email, error: error.message });
    throw mapSupabaseAuthError(error);
  }

  const actionLink = data?.properties?.action_link;
  if (!actionLink) {
    throw new Error('Could not generate auth link');
  }

  return actionLink;
}

async function deliverVerificationEmail(email, { password, isExistingUser = false } = {}) {
  const redirectTo = getEmailVerificationRedirectUrl();

  if (shouldUseSupabaseAuthMailerFirst()) {
    const supabaseResult = await sendVerificationViaSupabase(email, redirectTo);
    assertEmailSent(supabaseResult, 'Failed to send verification email');
    logger.info('Verification email dispatched', {
      email,
      redirectTo,
      via: supabaseResult.via,
    });
    return;
  }

  const redirectToCustom = redirectTo;
  let verifyLink;

  // Existing accounts: magiclink avoids Supabase "Database error finding user" on signup links
  if (isExistingUser) {
    verifyLink = await generateAuthLink('magiclink', email, { redirectTo: redirectToCustom });
  } else {
    try {
      verifyLink = await generateAuthLink('signup', email, {
        redirectTo: redirectToCustom,
        password,
      });
    } catch (signupError) {
      logger.warn('Signup verification link failed, trying magic link', {
        email,
        error: signupError.message,
      });
      verifyLink = await generateAuthLink('magiclink', email, { redirectTo: redirectToCustom });
    }
  }

  const result = await sendVerificationEmail(email, verifyLink);

  if (!result.sent && shouldTrySupabaseAuthMailerFallback()) {
    logger.warn('Custom verification email failed, falling back to Supabase mailer', {
      email,
      error: result.error,
    });
    const supabaseResult = await sendVerificationViaSupabase(email, redirectTo);
    assertEmailSent(supabaseResult, 'Failed to send verification email');
    logger.info('Verification email dispatched', {
      email,
      redirectTo,
      via: supabaseResult.via,
    });
    return;
  }

  assertEmailSent(result, 'Failed to send verification email');
  logger.info('Verification email dispatched', {
    email,
    redirectTo,
    via: result.devMode ? 'dev-console' : result.via || 'email',
  });
}

async function deliverPasswordResetEmail(email) {
  const redirectTo = getPasswordResetRedirectUrl();

  if (shouldUseSupabaseAuthMailerFirst()) {
    const supabaseResult = await sendPasswordResetViaSupabase(email, redirectTo);
    assertEmailSent(supabaseResult, 'Failed to send password reset email');
    logger.info('Password reset email sent via Supabase', { email, redirectTo });
    return;
  }

  const resetLink = await generateAuthLink('recovery', email, { redirectTo });
  const result = await sendPasswordResetEmail(email, resetLink);

  if (!result.sent && shouldTrySupabaseAuthMailerFallback()) {
    logger.warn('Custom password reset email failed, falling back to Supabase mailer', {
      email,
      error: result.error,
    });
    const supabaseResult = await sendPasswordResetViaSupabase(email, redirectTo);
    assertEmailSent(supabaseResult, 'Failed to send password reset email');
    logger.info('Password reset email sent via Supabase', { email, redirectTo });
    return;
  }

  assertEmailSent(result, 'Failed to send password reset email');
  logger.info('Password reset email sent', {
    email,
    redirectTo,
    via: result.devMode ? 'dev-console' : result.via || 'email',
  });
}

export const authRepository = {
  getEmailVerificationRedirectUrl,
  getPasswordResetRedirectUrl,
  getInviteRegistrationRedirectUrl,

  isAuthEmailVerified(authUser) {
    return !!(authUser?.email_confirmed_at || authUser?.confirmed_at);
  },

  async getAuthUserById(userId) {
    if (!userId) return null;
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error) {
      logger.warn('getUserById failed', { userId, error: error.message });
      return null;
    }
    return data?.user ?? null;
  },

  /**
   * Look up auth user via public.users (same id) — avoids listUsers which can fail on Supabase.
   */
  async findAuthUserByEmail(email) {
    const dbUser = await userRepository.findByEmail(email.trim().toLowerCase());
    if (!dbUser?.id) return null;
    return this.getAuthUserById(dbUser.id);
  },

  isEmailAlreadyRegisteredError,

  /**
   * Find an existing auth user by email when public.users may be missing.
   * Uses generateLink (no email sent) as a fallback when getUserById is unavailable.
   */
  async resolveAuthUserByEmail(email) {
    const normalized = email.trim().toLowerCase();
    const fromDb = await this.findAuthUserByEmail(normalized);
    if (fromDb) return fromDb;

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: normalized,
      options: { redirectTo: getEmailVerificationRedirectUrl() },
    });

    if (error) {
      logger.warn('resolveAuthUserByEmail failed', { email: normalized, error: error.message });
      return null;
    }

    return data?.user ?? null;
  },

  async ensurePublicUserRecord(authUser) {
    const existing = await userRepository.findById(authUser.id);
    if (existing) return existing;

    const { error } = await supabaseAdmin.from('users').insert({
      id: authUser.id,
      email: authUser.email?.trim().toLowerCase(),
      role: authUser.app_metadata?.role || 'reader',
      account_status: 'active',
      is_email_verified: false,
    });

    if (error && error.code !== '23505') {
      logger.error('ensurePublicUserRecord failed', { userId: authUser.id, error: error.message });
      throw error;
    }

    return userRepository.findById(authUser.id);
  },

  async updateUnverifiedUser(userId, password, metadata = {}) {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password,
      user_metadata: {
        display_name: metadata.display_name || metadata.displayName,
        ...metadata,
      },
      app_metadata: {
        role: metadata.role || 'reader',
      },
    });

    if (error) {
      logger.error('updateUnverifiedUser failed', { userId, error: error.message });
      throw error;
    }

    return data.user;
  },

  /**
   * Reader self-signup — creates auth user (does not send email; use sendVerificationEmailForUser).
   */
  async signUpReader(email, password, metadata = {}) {
    if (shouldRegisterViaPublicSupabaseSignUp()) {
      return signUpReaderViaSupabasePublic(email, password, {
        ...metadata,
        redirectTo: getEmailVerificationRedirectUrl(),
      });
    }
    return this.createUser(email, password, metadata);
  },

  usesSupabaseSignUpEmail() {
    return shouldRegisterViaPublicSupabaseSignUp();
  },

  async sendVerificationEmailForUser(email, password, { isExistingUser = false } = {}) {
    await deliverVerificationEmail(email, { password, isExistingUser });
  },

  /**
   * Admin/scripts only — does not send verification email.
   */
  async createUser(email, password, metadata = {}) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: {
        display_name: metadata.display_name || email.split('@')[0],
        ...metadata,
      },
      app_metadata: {
        role: metadata.role || 'reader',
      },
    });

    if (error) {
      logger.error('Auth createUser error', { email, error: error.message, status: error.status });
      if (isEmailAlreadyRegisteredError(error)) {
        throw new Error('EMAIL_ALREADY_REGISTERED');
      }
      throw error;
    }

    logger.info('Auth user created', { userId: data.user.id, email });
    return data.user;
  },

  /**
   * Verify user credentials with Supabase
   */
  async verifyCredentials(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { user: null, session: null, error };
    }

    return { user: data.user, session: data.session, error: null };
  },

  async refreshSession(refreshToken) {
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      return { session: null, error: error || new Error('No session returned') };
    }

    return { session: data.session, user: data.user, error: null };
  },

  /**
   * Reset password using access token from email link
   */
  async resetPassword(accessToken, newPassword, refreshToken = null) {
    const tempClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    if (refreshToken) {
      const { error: sessionError } = await tempClient.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) {
        logger.error('Reset password setSession error', { error: sessionError.message });
        throw mapSupabaseAuthError(sessionError);
      }
    } else {
      const { error: userError } = await tempClient.auth.getUser(accessToken);
      if (userError) {
        logger.error('Reset password token invalid', { error: userError.message });
        throw new Error('This reset link has expired. Please request a new one.');
      }
    }

    const updateClient = refreshToken
      ? tempClient
      : createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: `Bearer ${accessToken}` } },
        });

    const { error } = await updateClient.auth.updateUser({ password: newPassword });

    if (error) {
      logger.error('Reset password error', { error: error.message });
      const msg = error.message?.toLowerCase() || '';
      if (msg.includes('same') || msg.includes('different')) {
        throw new Error('New password must be different from your old password');
      }
      if (msg.includes('session') || msg.includes('jwt') || msg.includes('expired')) {
        throw new Error('This reset link has expired. Please request a new one.');
      }
      throw mapSupabaseAuthError(error);
    }

    try {
      await tempClient.auth.signOut();
    } catch {
      // ignore
    }

    logger.info('Password reset successful');
    return true;
  },

  /**
   * Set password from an invite link and keep the session for immediate sign-in.
   */
  async completeInviteRegistration(accessToken, newPassword, refreshToken = null) {
    const tempClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    if (refreshToken) {
      const { error: sessionError } = await tempClient.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) {
        logger.error('Invite setSession error', { error: sessionError.message });
        throw mapSupabaseAuthError(sessionError);
      }
    } else {
      const { error: userError } = await tempClient.auth.getUser(accessToken);
      if (userError) {
        logger.error('Invite token invalid', { error: userError.message });
        throw new Error('This invitation link has expired. Ask your admin for a new invite.');
      }
    }

    const updateClient = refreshToken
      ? tempClient
      : createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: `Bearer ${accessToken}` } },
        });

    const { error } = await updateClient.auth.updateUser({ password: newPassword });

    if (error) {
      logger.error('Invite password set error', { error: error.message });
      const msg = error.message?.toLowerCase() || '';
      if (msg.includes('session') || msg.includes('jwt') || msg.includes('expired')) {
        throw new Error('This invitation link has expired. Ask your admin for a new invite.');
      }
      throw mapSupabaseAuthError(error);
    }

    const { data: sessionData, error: sessionReadError } = await tempClient.auth.getSession();
    if (sessionReadError || !sessionData.session) {
      throw new Error('Could not complete registration. Please try again.');
    }

    logger.info('Invite registration password set', { userId: sessionData.session.user.id });
    return sessionData.session;
  },

  /**
   * Send password reset email via Nodemailer (SMTP)
   */
  async sendPasswordResetEmail(email) {
    await deliverPasswordResetEmail(email);
    return true;
  },

  /**
   * Resend email verification link via Nodemailer (SMTP)
   */
  async resendVerificationEmail(email) {
    await deliverVerificationEmail(email);
    return true;
  },

  /**
   * Sync email_verified flags in public.users after user clicks confirmation link.
   */
  async getUserFromAccessToken(accessToken) {
    return this.getUserFromToken(accessToken);
  },

  /** Keep Supabase Auth in sync when user completes our verification link. */
  async markEmailConfirmedInAuth(userId) {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email_confirm: true,
    });
    if (error) {
      logger.warn('markEmailConfirmedInAuth failed', { userId, error: error.message });
      return null;
    }
    return data?.user ?? null;
  },

  /**
   * Get user from token
   */
  async getUserFromToken(token) {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      logger.warn('getUserFromToken failed', { error: error?.message });
      return null;
    }

    return user;
  },

  /**
   * Sign out user (invalidate session)
   */
  async signOut(token) {
    const userClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        global: {
          headers: { Authorization: `Bearer ${token}` },
        },
      }
    );

    const { error } = await userClient.auth.signOut();
    if (error) {
      logger.error('Sign out error', { error: error.message });
    }
    return true;
  },
};
