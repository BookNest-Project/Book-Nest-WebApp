import { supabase, supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

function mapSupabaseMailError(error, context = {}) {
  const message = error?.message || 'Supabase could not send email';
  const lower = message.toLowerCase();
  const code = error?.code || error?.status || '';

  if (lower.includes('rate limit') || code === 'over_email_send_rate_limit') {
    return 'Too many emails sent. Please wait a few minutes before trying again.';
  }
  if (lower.includes('signups not allowed') || lower.includes('signup is disabled')) {
    return 'Email signups are disabled in Supabase. Enable Authentication → Providers → Email.';
  }
  if (lower.includes('redirect') || lower.includes('url')) {
    return `${message} Add ${context.redirectTo || 'your frontend URL'} to Supabase → Authentication → URL Configuration → Redirect URLs.`;
  }
  if (lower.includes('smtp') || lower.includes('mail')) {
    return `${message} Check Supabase → Authentication → SMTP Settings or use the default Supabase mailer.`;
  }
  return `${message} (code: ${code || 'unknown'}). Check Supabase Auth email settings and redirect URLs.`;
}

/**
 * Send signup / verification email using Supabase's mailer.
 * Works best for users created via auth.signUp(). For admin-created users, magic link OTP is tried first.
 */
export async function sendVerificationViaSupabase(email, redirectTo) {
  const normalized = email.trim().toLowerCase();

  logger.info('Sending verification via Supabase', { email: normalized, redirectTo });

  // Signup resend — best after auth.signUp() or for unconfirmed accounts
  const { error: resendError } = await supabase.auth.resend({
    type: 'signup',
    email: normalized,
    options: { emailRedirectTo: redirectTo },
  });

  if (!resendError) {
    logger.info('Verification email sent via Supabase (resend signup)', {
      email: normalized,
      redirectTo,
    });
    return { sent: true, via: 'supabase-resend' };
  }

  logger.warn('Supabase resend signup failed, trying magic link OTP', {
    email: normalized,
    error: resendError.message,
    code: resendError.code,
  });

  const { error: otpError } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: false,
    },
  });

  if (!otpError) {
    logger.info('Verification email sent via Supabase (magic link OTP)', {
      email: normalized,
      redirectTo,
    });
    return { sent: true, via: 'supabase-otp' };
  }

  logger.error('Supabase verification email failed', {
    email: normalized,
    redirectTo,
    resendError: resendError.message,
    resendCode: resendError.code,
    otpError: otpError.message,
    otpCode: otpError.code,
    hint: `Add ${redirectTo} to Supabase Auth redirect URLs and set FRONTEND_URL on Railway`,
  });

  return {
    sent: false,
    via: 'supabase',
    error: mapSupabaseMailError(resendError || otpError, { redirectTo }),
  };
}

/**
 * Send password reset email using Supabase's built-in mailer.
 */
export async function sendPasswordResetViaSupabase(email, redirectTo) {
  const normalized = email.trim().toLowerCase();

  const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
    redirectTo,
  });

  if (!error) {
    logger.info('Password reset email sent via Supabase', { email: normalized, redirectTo });
    return { sent: true, via: 'supabase-recovery' };
  }

  logger.error('Supabase password reset email failed', {
    email: normalized,
    error: error.message,
    code: error.code,
  });

  return {
    sent: false,
    via: 'supabase',
    error: mapSupabaseMailError(error, { redirectTo }),
  };
}

/**
 * Register via public signUp() — Supabase sends the confirmation email when "Confirm email" is ON.
 * admin.createUser() does NOT send email; do not use it when AUTH_EMAIL_PROVIDER=supabase.
 */
export async function signUpReaderViaSupabasePublic(email, password, metadata = {}) {
  const normalized = email.trim().toLowerCase();
  const redirectTo = metadata.redirectTo;

  const { data, error } = await supabase.auth.signUp({
    email: normalized,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        display_name: metadata.display_name || normalized.split('@')[0],
      },
    },
  });

  if (error) {
    logger.error('Supabase public signUp failed', {
      email: normalized,
      error: error.message,
      code: error.code,
    });
    const lower = (error.message || '').toLowerCase();
    if (
      lower.includes('already registered') ||
      lower.includes('already been registered') ||
      error.status === 422
    ) {
      throw new Error('EMAIL_ALREADY_REGISTERED');
    }
    throw error;
  }

  if (!data?.user?.id) {
    const err = new Error('EMAIL_ALREADY_REGISTERED');
    throw err;
  }

  const { error: metaError } = await supabaseAdmin.auth.admin.updateUserById(data.user.id, {
    app_metadata: { role: metadata.role || 'reader' },
    user_metadata: {
      display_name: metadata.display_name || normalized.split('@')[0],
    },
  });

  if (metaError) {
    logger.warn('Post-signUp role metadata update failed', {
      userId: data.user.id,
      error: metaError.message,
    });
  }

  const emailDispatched =
    Boolean(data.user) &&
    (!data.session || data.user.identities?.length > 0);

  logger.info('Reader registered via Supabase signUp (confirmation email sent by Supabase)', {
    userId: data.user.id,
    email: normalized,
    redirectTo,
    emailDispatched,
    hasSession: Boolean(data.session),
  });

  return data.user;
}
