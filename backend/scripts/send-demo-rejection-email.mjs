/**
 * Resend the formal rejection email for the demo book (after SMTP is configured).
 *
 * Usage:
 *   node scripts/send-demo-rejection-email.mjs [bookId]
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { sendBookRejectionEmail } from '../services/rejectionEmail.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const bookId = process.argv[2] || '93cacbb2-8c5c-433d-b54a-dc05f8396809';
const AUTHOR_EMAIL = 'solenedawit7@gmail.com';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: book } = await supabase.from('books').select('*').eq('id', bookId).single();
const { data: admin } = await supabase.from('users').select('id, email').eq('role', 'admin').limit(1).single();

const reason =
  book?.review_note ||
  'Page 5 revision does not meet our quality guidelines — the scene needs clearer structure and consistent tone with earlier chapters.';

const result = await sendBookRejectionEmail({
  to: AUTHOR_EMAIL,
  authorName: book?.author_name || 'Isolene Dawit',
  bookTitle: book?.title || 'Your book',
  bookId,
  reason,
  adminNotes: 'Please expand the transition into the ember garden.',
  suggestedFixes: 'Resubmit after editing page 5.',
  severity: 'medium',
  reviewerName: admin?.email?.split('@')[0] || 'BookNest Moderator',
  reviewerEmail: admin?.email,
  reviewedAt: book?.reviewed_at || new Date().toISOString(),
});

console.log(result.sent ? '✅ Email sent to ' + AUTHOR_EMAIL : '❌ Email failed: ' + (result.reason || 'unknown'));
if (!result.sent) {
  console.log('\nAdd to backend/.env:\n  SMTP_HOST=smtp.gmail.com\n  SMTP_PORT=587\n  SMTP_USER=your@gmail.com\n  SMTP_PASS=your-app-password\n  SMTP_FROM="BookNest <your@gmail.com>"');
}
