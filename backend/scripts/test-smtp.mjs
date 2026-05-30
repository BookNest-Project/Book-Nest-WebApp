/**
 * Verify Gmail SMTP sends to a real inbox.
 * Usage: node scripts/test-smtp.mjs recipient@gmail.com
 *
 * Requires SMTP_PASS = Google App Password in backend/.env
 */
import dotenv from 'dotenv';
import { sendEmail, isRealSmtpConfigured } from '../services/emailService.js';

dotenv.config();

const to = process.argv[2];
if (!to) {
  console.error('Usage: node scripts/test-smtp.mjs recipient@gmail.com');
  process.exit(1);
}

if (!isRealSmtpConfigured()) {
  console.error(`
❌ Gmail not ready for real delivery.

Add to backend/.env:
  SMTP_PASS=your-16-char-google-app-password

Get it from: Google Account → Security → 2-Step Verification → App passwords

Then restart the backend and run this test again.
`);
  process.exit(1);
}

console.log(`Sending test email to ${to} via ${process.env.SMTP_USER}...`);

const result = await sendEmail({
  to,
  subject: 'BookNest — SMTP test (real Gmail)',
  text: 'If you see this in your inbox, invitation emails will work.',
  html: '<p>If you see this in your <strong>inbox</strong>, invitation emails will work.</p>',
});

console.log(JSON.stringify(result, null, 2));

if (result.sent && result.realDelivery) {
  console.log('\n✅ Sent via Gmail. Check the recipient inbox (and spam folder).');
  process.exit(0);
}

console.error('\n❌ Failed:', result.message || result.reason);
process.exit(1);
