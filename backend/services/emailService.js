import { logger } from '../utils/logger.js';

/**
 * Send transactional email via Resend (optional if RESEND_API_KEY unset).
 */
export async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'BookNest <noreply@booknest.app>';

  if (!apiKey) {
    logger.warn('RESEND_API_KEY not set; skipping email', { to, subject });
    return { sent: false, skipped: true };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error('Resend email failed', { status: res.status, body });
      return { sent: false, error: body };
    }

    return { sent: true };
  } catch (error) {
    logger.error('Email send error', { error: error.message });
    return { sent: false, error: error.message };
  }
}

export async function sendWithdrawalEmail(userEmail, { status, amount, currency, adminNote }) {
  const subject =
    status === 'pending'
      ? 'Withdrawal request received — BookNest'
      : `Withdrawal ${status} — BookNest`;

  const html = `
    <h2>Withdrawal update</h2>
    <p>Your withdrawal request for <strong>${amount} ${currency}</strong> is now <strong>${status}</strong>.</p>
    ${adminNote ? `<p>Note: ${adminNote}</p>` : ''}
    <p>— BookNest</p>
  `;

  return sendEmail({ to: userEmail, subject, html });
}
