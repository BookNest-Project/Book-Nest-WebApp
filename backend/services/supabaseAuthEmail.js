import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

function mapSupabaseMailError(error) {
  const message = error?.message || 'Supabase could not send email';
  const lower = message.toLowerCase();
  if (lower.includes('rate limit')) {
    const err = new Error('Too many emails sent. Please wait a few minutes before trying again.');
    err.name = 'RATE_LIMIT';
    return err;
  }
  if (lower.includes('email not confirmed') || lower.includes('already confirmed')) {
    return new Error(message);
  }
  return new Error(
    `${message} Check Supabase Dashboard → Authentication → URL Configuration (Site URL + redirect URLs) and Email templates.`
  );
}

/**
 * Send signup / verification email using Supabase's built-in mailer (or SMTP configured in Supabase).
 */
export async function sendVerificationViaSupabase(email, redirectTo) {
  const normalized = email.trim().toLowerCase();

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
    return { sent: true, via: 'supabase' };
  }

  logger.warn('Supabase resend signup failed, trying magic link OTP', {
    email: normalized,
    error: resendError.message,
  });

  const { error: otpError } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: false,
    },
  });

  if (!otpError) {
    logger.info('Verification email sent via Supabase (magic link)', {
      email: normalized,
      redirectTo,
    });
    return { sent: true, via: 'supabase' };
  }

  logger.error('Supabase verification email failed', {
    email: normalized,
    resendError: resendError.message,
    otpError: otpError.message,
  });

  return {
    sent: false,
    via: 'supabase',
    error: mapSupabaseMailError(otpError || resendError).message,
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
    return { sent: true, via: 'supabase' };
  }

  logger.error('Supabase password reset email failed', {
    email: normalized,
    error: error.message,
  });

  return {
    sent: false,
    via: 'supabase',
    error: mapSupabaseMailError(error).message,
  };
}
