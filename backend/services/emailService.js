import nodemailer from 'nodemailer';
import { logger } from '../utils/logger.js';

let transporter = null;

function getSmtpPass() {
  return (process.env.SMTP_PASS || '').replace(/\s+/g, '').trim();
}

export function isSmtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      getSmtpPass()
  );
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
  });

  return transporter;
}

function getFromAddress() {
  return process.env.EMAIL_FROM || `BookNest <${process.env.SMTP_USER}>`;
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

async function deliverEmail({ to, subject, html, devLink }) {
  const transport = getTransporter();

  if (!transport) {
    if (allowDevEmailLog()) {
      logger.warn('SMTP not configured — logging email link for development', {
        to,
        subject,
        link: devLink,
      });
      return { sent: true, devMode: true };
    }

    logger.error('SMTP not configured; cannot send email', { to, subject });
    return {
      sent: false,
      error: 'Email service is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.',
    };
  }

  try {
    await transport.sendMail({
      from: getFromAddress(),
      to,
      subject,
      html,
    });
    logger.info('Email sent', { to, subject });
    return { sent: true };
  } catch (error) {
    logger.error('Email send error', { to, subject, error: error.message });
    return { sent: false, error: error.message };
  }
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
