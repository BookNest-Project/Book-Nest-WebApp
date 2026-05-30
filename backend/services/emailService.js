import { logger } from '../utils/logger.js';

function normalizeRecipient(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isPlaceholderSmtpPass(pass) {
  if (!pass) return true;
  return /your|password|changeme|xxx|replace|example|app-password/i.test(pass);
}

function normalizeSmtpPass(pass) {
  return String(pass || '').trim().replace(/\s+/g, '');
}

export function isRealSmtpConfigured() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = normalizeSmtpPass(process.env.SMTP_PASS);
  return Boolean(host && user && pass && !isPlaceholderSmtpPass(pass));
}

function gmailSetupMessage() {
  return (
    'Gmail App Password required in backend/.env → SMTP_PASS. ' +
    'Google Account → Security → 2-Step Verification → App passwords → create one for Mail, ' +
    'paste the 16-character password (no spaces needed), set SMTP_DEV_ETHEREAL=false, restart backend.'
  );
}

async function createGmailTransporter(user, pass) {
  const nodemailer = await import('nodemailer');
  const port = Number(process.env.SMTP_PORT || 587);

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST?.trim() || 'smtp.gmail.com',
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
  });
}

/**
 * Sends email via Gmail SMTP. Requires SMTP_PASS (Google App Password).
 * Invitations only count as delivered when realDelivery is true.
 */
export async function sendEmail({ to, subject, text, html }) {
  const recipient = normalizeRecipient(to);

  if (!recipient) {
    logger.warn('Email skipped: missing recipient address');
    return { sent: false, realDelivery: false, reason: 'missing_recipient', to: null };
  }

  if (!isValidEmail(recipient)) {
    logger.warn('Email skipped: invalid recipient address', { to: recipient });
    return { sent: false, realDelivery: false, reason: 'invalid_recipient', to: recipient };
  }

  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = normalizeSmtpPass(process.env.SMTP_PASS);

  if (!host || !user) {
    logger.warn('Email skipped: SMTP not configured', { to: recipient });
    return {
      sent: false,
      realDelivery: false,
      reason: 'not_configured',
      to: recipient,
      message: 'Add SMTP_HOST and SMTP_USER to backend/.env.',
    };
  }

  if (!pass || isPlaceholderSmtpPass(pass)) {
    logger.warn('Email skipped: SMTP_PASS missing (Gmail App Password)', { to: recipient });
    return {
      sent: false,
      realDelivery: false,
      reason: 'smtp_auth_missing',
      to: recipient,
      message: gmailSetupMessage(),
    };
  }

  try {
    const transporter = await createGmailTransporter(user, pass);
    const from = process.env.SMTP_FROM?.trim() || `BookNest <${user}>`;

    const info = await transporter.sendMail({
      from,
      to: recipient,
      replyTo: user,
      subject,
      text,
      html: html || text.replace(/\n/g, '<br>'),
    });

    logger.info('Email delivered via Gmail SMTP', {
      to: recipient,
      subject,
      messageId: info.messageId,
      from,
    });

    return {
      sent: true,
      realDelivery: true,
      to: recipient,
      messageId: info.messageId,
    };
  } catch (error) {
    const msg = error.message || 'send_failed';
    logger.error('Gmail SMTP send failed', { to: recipient, subject, error: msg });

    let hint = msg;
    if (msg.includes('Invalid login') || msg.includes('535') || msg.includes('BadCredentials')) {
      hint =
        'Gmail rejected the login. Use a Google App Password in SMTP_PASS (not your normal Gmail password). ' +
        gmailSetupMessage();
    } else if (msg.includes('EAUTH')) {
      hint = gmailSetupMessage();
    }

    return { sent: false, realDelivery: false, reason: hint, to: recipient, message: hint };
  }
}
