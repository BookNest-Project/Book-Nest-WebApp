/**
 * Seeds a revenue agreement for an author (by email) for admin approval testing.
 * Usage: node scripts/seed-author-revenue-agreement.mjs author@example.com
 */
import 'dotenv/config';
import { supabaseAdmin } from '../config/supabase.js';

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/seed-author-revenue-agreement.mjs <author-email>');
  process.exit(1);
}

const { data: user, error: userErr } = await supabaseAdmin
  .from('users')
  .select('id, email, role')
  .eq('email', email)
  .maybeSingle();

if (userErr || !user) {
  console.error('User not found:', userErr?.message || email);
  process.exit(1);
}

const { data: profile } = await supabaseAdmin
  .from('author_profiles')
  .select('pen_name, full_name')
  .eq('user_id', user.id)
  .maybeSingle();

const { error } = await supabaseAdmin.from('author_revenue_agreements').upsert(
  {
    author_user_id: user.id,
    agreement_version: '1.0',
    accepted_at: new Date().toISOString(),
    author_name: profile?.pen_name || profile?.full_name || 'Author',
    author_email: user.email,
    ip_address: '127.0.0.1',
    signature_data: { method: 'clickwrap', seeded: true },
  },
  { onConflict: 'author_user_id,agreement_version' },
);

if (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(`Revenue agreement seeded for ${user.email} (${user.id})`);
