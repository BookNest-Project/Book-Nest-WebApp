function isSmtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      (process.env.SMTP_PASS || '').replace(/\s+/g, '').trim()
  );
}

/**
 * AUTH_EMAIL_PROVIDER:
 *   auto     — production: brevo → resend → supabase (no SMTP). local: smtp → brevo → resend → supabase
 *   supabase — auth emails only via Supabase mailer
 *   smtp     — force SMTP for custom BookNest templates (local dev)
 *   custom   — brevo/resend/smtp chain only, never Supabase
 */
export function getAuthEmailProvider() {
  const raw = process.env.AUTH_EMAIL_PROVIDER?.trim().toLowerCase();
  if (raw) return raw;
  return 'auto';
}

export function isProductionDeploy() {
  return process.env.NODE_ENV === 'production';
}

/** Railway and similar hosts block outbound SMTP — never wait 15s there. */
export function shouldAttemptSmtp() {
  if (!isSmtpConfigured()) return false;
  const provider = getAuthEmailProvider();
  if (provider === 'smtp') return true;
  if (provider === 'supabase') return false;
  if (isProductionDeploy()) return false;
  return true;
}

export function shouldUseSupabaseAuthMailerFirst() {
  return getAuthEmailProvider() === 'supabase';
}

/** New reader signup via public signUp() so Supabase sends the confirmation email. */
export function shouldRegisterViaPublicSupabaseSignUp() {
  const provider = getAuthEmailProvider();
  if (provider === 'supabase') return true;
  if (provider === 'auto' && isProductionDeploy()) return true;
  return false;
}

export function shouldSkipCustomAuthEmailAfterSignUp() {
  return shouldRegisterViaPublicSupabaseSignUp();
}

export function shouldTrySupabaseAuthMailerFallback() {
  const provider = getAuthEmailProvider();
  if (provider === 'custom' || provider === 'smtp') return false;
  return provider === 'auto' || provider === 'supabase';
}

export function describeAuthEmailPolicy() {
  const provider = getAuthEmailProvider();
  if (provider === 'supabase') return 'supabase-only';
  if (provider === 'smtp') return 'smtp-only';
  if (isProductionDeploy()) {
    return 'auto(prod): brevo→resend→supabase, no SMTP';
  }
  return 'auto(local): smtp→brevo→resend→supabase';
}
