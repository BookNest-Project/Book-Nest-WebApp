/**
 * Restore Supabase to pre-face-recognition state (metadata + optional tables).
 *
 * Requires direct Postgres access:
 *   Supabase Dashboard → Project Settings → Database → Connection string (URI)
 *   Add to backend/.env:  SUPABASE_DB_URL=postgresql://...
 *
 * Run:  node scripts/restore-supabase-pre-face.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, 'restore-supabase-pre-face.sql');
const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  console.log(`
Cannot run automatic restore without database URL.

Your books, users, and admin data in public.* tables are unchanged.
Only auth user_metadata may contain leftover "face_auth" from face login tests.

To finish cleanup:
1. Open Supabase SQL Editor:
   https://supabase.com/dashboard/project/usafbxivbynfdrcrqqdf/sql/new
2. Paste and run: backend/scripts/restore-supabase-pre-face.sql

Or add SUPABASE_DB_URL to backend/.env and run this script again.
`);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf8');
const client = new pg.Client({ connectionString: dbUrl });

try {
  await client.connect();
  await client.query(sql);
  console.log('Restore SQL applied successfully.');
  console.log('Admin password was not changed (still serapeta@1999 for solenedawit7@gmail.com if you set it).');
} catch (err) {
  console.error('Restore failed:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
