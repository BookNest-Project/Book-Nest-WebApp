/**
 * Creates admin_invitations table when SUPABASE_DB_URL (or DATABASE_URL) is set.
 *
 * Usage: npm run setup:invitations
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, 'admin-invitations.sql');
const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error(`
Missing SUPABASE_DB_URL or DATABASE_URL in backend/.env

Option A — automatic (recommended):
  1. Supabase Dashboard → Project Settings → Database → Connection string → URI
  2. Add to backend/.env:  SUPABASE_DB_URL=postgresql://postgres.[ref]:[password]@...
  3. Run:  npm run setup:invitations

Option B — manual:
  Open Supabase → SQL Editor → New query
  Paste the full contents of:  backend/scripts/admin-invitations.sql
  Click Run
`);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf8');

let pg;
try {
  pg = await import('pg');
} catch {
  console.error('Install pg first:  npm install pg');
  process.exit(1);
}

const client = new pg.default.Client({
  connectionString,
  ssl: connectionString.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(sql);
  console.log('✅ admin_invitations table created successfully.');
} catch (err) {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
