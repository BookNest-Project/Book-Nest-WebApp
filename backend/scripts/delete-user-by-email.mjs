import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email) {
  console.error('Usage: node scripts/delete-user-by-email.mjs <email>');
  process.exit(1);
}

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const PROFILE_TABLES = [
  'reader_profiles',
  'author_profiles',
  'publisher_profiles',
  'admin_profiles',
];

async function deleteByUserId(table, userId) {
  const { error, count } = await supabaseAdmin.from(table).delete({ count: 'exact' }).eq('user_id', userId);
  if (error && !error.message.includes('does not exist')) {
    console.warn(`  ${table}: ${error.message}`);
  } else if (count) {
    console.log(`  Removed ${count} row(s) from ${table}`);
  }
}

async function main() {
  const { data: user, error: findError } = await supabaseAdmin
    .from('users')
    .select('id, email, role')
    .ilike('email', email)
    .maybeSingle();

  if (findError) {
    console.error('Lookup failed:', findError.message);
    process.exit(1);
  }

  if (!user) {
    const { data: authList } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const authUser = authList?.users?.find((u) => u.email?.toLowerCase() === email);
    if (!authUser) {
      console.log(`No user found with email ${email}`);
      process.exit(0);
    }
    console.log(`Found auth-only user ${authUser.id}, deleting from Auth...`);
    const { error: authDelError } = await supabaseAdmin.auth.admin.deleteUser(authUser.id);
    if (authDelError) {
      console.error('Auth delete failed:', authDelError.message);
      process.exit(1);
    }
    console.log('Done.');
    process.exit(0);
  }

  console.log(`Deleting user ${user.email} (${user.id}, role=${user.role})...`);

  for (const table of PROFILE_TABLES) {
    await deleteByUserId(table, user.id);
  }

  const { count: inviteCount } = await supabaseAdmin
    .from('admin_invitations')
    .delete({ count: 'exact' })
    .eq('recipient_email', email);

  if (inviteCount) {
    console.log(`  Removed ${inviteCount} invitation(s)`);
  }

  const { error: userDelError } = await supabaseAdmin.from('users').delete().eq('id', user.id);
  if (userDelError) {
    console.error('users delete failed:', userDelError.message);
    process.exit(1);
  }
  console.log('  Removed users row');

  const { error: authDelError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (authDelError) {
    console.error('Auth delete failed:', authDelError.message);
    process.exit(1);
  }
  console.log('  Removed Supabase Auth account');
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
