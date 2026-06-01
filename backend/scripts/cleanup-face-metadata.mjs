/**
 * Remove leftover face_auth blobs from Supabase auth user_metadata (fixes oversized JWT cookies).
 * Run: node scripts/cleanup-face-metadata.mjs
 */
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.log('Set SUPABASE_DB_URL in backend/.env (Database connection string from Supabase dashboard).');
  process.exit(1);
}

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

const { rows } = await client.query(`
  SELECT id, email, raw_user_meta_data
  FROM auth.users
  WHERE raw_user_meta_data ? 'face_auth'
`);

for (const row of rows) {
  const meta = { ...row.raw_user_meta_data };
  delete meta.face_auth;
  await client.query(
    `UPDATE auth.users SET raw_user_meta_data = $1::jsonb WHERE id = $2`,
    [JSON.stringify(meta), row.id],
  );
  console.log('Cleaned', row.email);
}

console.log(rows.length ? 'Done.' : 'No users with face_auth in metadata.');
await client.end();
