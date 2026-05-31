import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { logger } from '../utils/logger.js';

let transporter = null;
let resendClient = null;

const SMTP_TIMEOUT_MS = 15_000;

function getSmtpPass() {
  return (process.env.SMTP_PASS || '').replace(/\s+/g, '').trim();
}

export function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function isSmtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      getSmtpPass()
  );
}

/** Preferred transport for production (Railway blocks SMTP on most plans). */
export function getEmailTransportMode() {
  if (isResendConfigured()) return 'resend';
  if (isSmtpConfigured()) return 'smtp';
  if (process.env.NODE_ENV !== 'production' || process.env.AUTH_RELAX_EMAIL_LIMITS === 'true') {
    return 'dev-log';
  }
  return 'none';
}

function getResendClient() {
  if (resendClient) return resendClient;
  if (!isResendConfigured()) return null;
  resendClient = new Resend(process.env.RESEND_API_KEY.trim());
  return resendClient;
}

function getTransporter() {
  if (transporter) return transporter;
  if (!isSmtpConfigured()) return null;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST.trim(),
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER.trim(),
      pass: getSmtpPass(),
    },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });

  return transporter;
}

function getFromAddress() {
  if (process.env.EMAIL_FROM?.trim()) {
    return process.env.EMAIL_FROM.trim();
  }
  if (isResendConfigured()) {
    return 'BookNest <onboarding@resend.dev>';
  }
  if (process.env.SMTP_USER?.trim()) {
    return `BookNest <${process.env.SMTP_USER.trim()}>`;
  }
  return 'BookNest <noreply@booknest.app>';
}

function allowDevEmailLog() {
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.AUTH_RELAX_EMAIL_LIMITS === 'true'
  );
}

function layout(title, bodyHtml) {
  return `
<!DOCTYPE html>
<html>
  <body style="font-family: Georgia, 'Times New Roman', serif; background:#FDFBF7; margin:0; padding:24px;">
    <div style="max-width:520px; margin:0 auto; background:#ffffff; border:1px solid #E8E2D9; border-radius:16px; padding:32px;">
      <p style="margin:0 0 8px; font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:#B85C38;">BookNest</p>
      <h1 style="margin:0 0 16px; font-size:22px; color:#1A2A3A;">${title}</h1>
      ${bodyHtml}
      <p style="margin:24px 0 0; font-size:12px; color:#4A5568;">If you did not request this, you can ignore this email.</p>
    </div>
  </body>
</html>`;
}

async function sendViaResend({ to, subject, html }) {
  const client = getResendClient();
  if (!client) return null;

  try {
    const { data, error } = await client.emails.send({
      from: getFromAddress(),
      to,
      subject,
      html,
    });

    if (error) {
      logger.error('Resend API error', {
        to,
        subject,
        from: getFromAddress(),
        error: error.message,
        name: error.name,
      });
      return { sent: false, error: error.message, via: 'resend' };
    }

    logger.info('Email sent via Resend', { to, subject, id: data?.id });
    return { sent: true, via: 'resend' };
  } catch (error) {
    logger.error('Resend send failed', { to, subject, error: error.message });
    return { sent: false, error: error.message };
  }
}

async function sendViaSmtp({ to, subject, html }) {
  const transport = getTransporter();
  if (!transport) return null;

  try {
    await transport.sendMail({
      from: getFromAddress(),
      to,
      subject,
      html,
    });
    logger.info('Email sent via SMTP', { to, subject });
    return { sent: true, via: 'smtp' };
  } catch (error) {
    const hint =
      error.code === 'ETIMEDOUT' || error.message?.includes('timeout')
        ? ' (Railway blocks Gmail SMTP on most plans — set RESEND_API_KEY instead)'
        : '';
    logger.error('SMTP send error', { to, subject, error: error.message, code: error.code });
    return { sent: false, error: `${error.message}${hint}` };
  }
}

function mapResendError(message) {
  const lower = (message || '').toLowerCase();
  if (lower.includes('only send') && lower.includes('your own')) {
    return `${message} Add and verify your domain in Resend, or test with the email on your Resend account.`;
  }
  if (lower.includes('invalid') && lower.includes('from')) {
    return `${message} Set EMAIL_FROM=BookNest <onboarding@resend.dev> on Railway until your domain is verified.`;
  }
  return message;
}

async function deliverEmail({ to, subject, html, devLink }) {
  if (isResendConfigured()) {
    const resendResult = await sendViaResend({ to, subject, html });
    if (resendResult?.sent) return resendResult;

    // In production, do not fall back to SMTP when Resend is configured — Railway blocks SMTP.
    const skipSmtpFallback =
      process.env.NODE_ENV === 'production' || !isSmtpConfigured();
    if (skipSmtpFallback && resendResult) {
      return {
        ...resendResult,
        error: mapResendError(resendResult.error),
      };
    }
  }

  if (isSmtpConfigured()) {
    const smtpResult = await sendViaSmtp({ to, subject, html });
    if (smtpResult) return smtpResult;
  }

  if (allowDevEmailLog()) {
    logger.warn('Email not sent — logging link for development', {
      to,
      subject,
      link: devLink,
    });
    return { sent: true, devMode: true };
  }

  logger.error('No email transport configured', { to, subject });
  return {
    sent: false,
    error:
      'Email service is not configured. On Railway set RESEND_API_KEY (recommended) or use SMTP on a Pro plan.',
  };
}

export async function sendEmail({ to, subject, html, devLink }) {
  return deliverEmail({ to, subject, html, devLink });
}

export async function sendVerificationEmail(to, verifyLink) {
  const subject = 'Confirm your BookNest account';
  const html = layout(
    'Confirm your email',
    `
      <p style="color:#4A5568; line-height:1.6;">Thanks for joining BookNest. Click the button below to verify your email and start reading.</p>
      <p style="margin:24px 0;">
        <a href="${verifyLink}" style="display:inline-block; background:#B85C38; color:#ffffff; text-decoration:none; padding:12px 20px; border-radius:10px; font-weight:600;">
          Verify email
        </a>
      </p>
      <p style="color:#4A5568; font-size:13px; line-height:1.5;">Or copy this link:<br><a href="${verifyLink}" style="color:#B85C38; word-break:break-all;">${verifyLink}</a></p>
    `
  );

  return deliverEmail({ to, subject, html, devLink: verifyLink });
}

export async function sendPasswordResetEmail(to, resetLink) {
  const subject = 'Reset your BookNest password';
  const html = layout(
    'Reset your password',
    `
      <p style="color:#4A5568; line-height:1.6;">We received a request to reset your password. This link expires soon.</p>
      <p style="margin:24px 0;">
        <a href="${resetLink}" style="display:inline-block; background:#B85C38; color:#ffffff; text-decoration:none; padding:12px 20px; border-radius:10px; font-weight:600;">
          Reset password
        </a>
      </p>
      <p style="color:#4A5568; font-size:13px; line-height:1.5;">Or copy this link:<br><a href="${resetLink}" style="color:#B85C38; word-break:break-all;">${resetLink}</a></p>
    `
  );

  return deliverEmail({ to, subject, html, devLink: resetLink });
}

export async function sendWithdrawalEmail(userEmail, { status, amount, currency, adminNote }) {
  const subject =
    status === 'pending'
      ? 'Withdrawal request received — BookNest'
      : `Withdrawal ${status} — BookNest`;

  const html = layout(
    'Withdrawal update',
    `
      <p style="color:#4A5568; line-height:1.6;">Your withdrawal request for <strong>${amount} ${currency}</strong> is now <strong>${status}</strong>.</p>
      ${adminNote ? `<p style="color:#4A5568;">Note: ${adminNote}</p>` : ''}
    `
  );

  return deliverEmail({ to: userEmail, subject, html });
}

export function assertEmailSent(result, fallbackMessage = 'Failed to send email') {
  if (result?.sent) return;
  const err = new Error(result?.error || fallbackMessage);
  err.name = 'EMAIL_SEND_FAILED';
  throw err;
}
