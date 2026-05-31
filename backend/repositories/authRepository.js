// backend/repositories/authRepository.js
import { supabase, supabaseAdmin } from '../config/supabase.js';
import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';
import { getFrontendUrl } from '../utils/envUrls.js';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  assertEmailSent,
} from '../services/emailService.js';

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

async function deliverVerificationEmail(email, password) {
  const redirectTo = getEmailVerificationRedirectUrl();
  const linkOptions = password ? { redirectTo, password } : { redirectTo };
  const verifyLink = await generateAuthLink('signup', email, linkOptions);
  const result = await sendVerificationEmail(email, verifyLink);
  assertEmailSent(result, 'Failed to send verification email');
  logger.info('Verification email dispatched', {
    email,
    redirectTo,
    via: result.devMode ? 'dev-console' : result.via || 'email',
  });
}

async function deliverPasswordResetEmail(email) {
  const redirectTo = getPasswordResetRedirectUrl();
  const resetLink = await generateAuthLink('recovery', email, { redirectTo });
  const result = await sendPasswordResetEmail(email, resetLink);
  assertEmailSent(result, 'Failed to send password reset email');
  logger.info('Password reset email sent via SMTP', { email, redirectTo, devMode: !!result.devMode });
}

export const authRepository = {
  getEmailVerificationRedirectUrl,
  getPasswordResetRedirectUrl,

  /**
   * Reader self-signup — creates auth user (does not send email; use sendVerificationEmailForUser).
   */
  async signUpReader(email, password, metadata = {}) {
    return this.createUser(email, password, metadata);
  },

  async sendVerificationEmailForUser(email, password) {
    await deliverVerificationEmail(email, password || undefined);
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
