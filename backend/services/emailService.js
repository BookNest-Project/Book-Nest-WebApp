import { logger } from '../utils/logger.js';

/**
 * Sends email via SMTP (configure in .env).
 * SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, ADMIN_APP_URL
 */
export async function sendEmail({ to, subject, text, html }) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !to) {
    logger.info('Email skipped (SMTP_HOST or recipient missing)', { subject, to });
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const nodemailer = await import('nodemailer');
    const port = Number(process.env.SMTP_PORT || 587);
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });

    const from = process.env.SMTP_FROM || user || 'booknest@localhost';

    await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html: html || text.replace(/\n/g, '<br>'),
    });

    logger.info('Email sent', { to, subject });
    return { sent: true };
  } catch (error) {
    logger.error('Email send failed', { to, subject, error: error.message });
    return { sent: false, reason: error.message };
  }
}
