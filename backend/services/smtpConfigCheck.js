import { isRealSmtpConfigured } from '../services/emailService.js';
import { logger } from '../utils/logger.js';

export async function warnIfSmtpNotConfigured() {
  if (isRealSmtpConfigured()) {
    logger.info('Gmail SMTP configured for real email delivery', {
      user: process.env.SMTP_USER?.trim(),
    });
    return;
  }

  logger.warn(
    'Gmail SMTP_PASS not set — invitation emails will NOT reach real inboxes. ' +
      'Add Google App Password to SMTP_PASS in backend/.env and restart.',
  );
}
