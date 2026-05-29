// backend/repositories/authRepository.js
import { supabase, supabaseAdmin } from '../config/supabase.js';
import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';
import { getFrontendUrl } from '../utils/envUrls.js';

function getEmailVerificationRedirectUrl() {
  return `${getFrontendUrl()}/auth/verify`;
}

function getPasswordResetRedirectUrl() {
  return `${getFrontendUrl()}/reset-password`;
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

export const authRepository = {
  getEmailVerificationRedirectUrl,
  getPasswordResetRedirectUrl,

  /**
   * Reader self-signup — Supabase sends the confirmation email automatically
   * (admin.createUser does NOT send confirmation emails).
   */
  async signUpReader(email, password, metadata = {}) {
    const redirectTo = getEmailVerificationRedirectUrl();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          display_name: metadata.display_name || email.split('@')[0],
        },
      },
    });

    if (error) {
      logger.error('Auth signUp error', { email, error: error.message });
      const msg = error.message?.toLowerCase() || '';
      if (msg.includes('already') || msg.includes('registered')) {
        throw new Error('EMAIL_ALREADY_REGISTERED');
      }
      throw error;
    }

    if (!data.user) {
      throw new Error('SIGNUP_FAILED');
    }

    try {
      await supabaseAdmin.auth.admin.updateUserById(data.user.id, {
        app_metadata: { role: metadata.role || 'reader' },
      });
    } catch (metaError) {
      logger.warn('Could not set app_metadata role after signup', {
        userId: data.user.id,
        error: metaError.message,
      });
    }

    logger.info('Reader signup created; confirmation email requested', {
      userId: data.user.id,
      email,
      redirectTo,
    });

    return data.user;
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
      logger.error('Auth createUser error', { email, error: error.message });
      if (error.message?.toLowerCase().includes('already')) {
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
   * Send password reset email
   */
  async sendPasswordResetEmail(email, redirectUrl) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl || getPasswordResetRedirectUrl(),
    });

    if (error) {
      logger.error('Send reset email error', { email, error: error.message });
      throw mapSupabaseAuthError(error);
    }

    logger.info('Password reset email sent', { email, redirectTo: redirectUrl });
    return true;
  },

  /**
   * Resend email verification link
   */
  async resendVerificationEmail(email) {
    const redirectTo = getEmailVerificationRedirectUrl();

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      logger.error('Resend verification error', { email, error: error.message });
      throw error;
    }

    logger.info('Verification email resent', { email, redirectTo });
    return true;
  },

  /**
   * Sync email_verified flags in public.users after user clicks confirmation link.
   */
  async getUserFromAccessToken(accessToken) {
    return this.getUserFromToken(accessToken);
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
    // Create a client with the user's token
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