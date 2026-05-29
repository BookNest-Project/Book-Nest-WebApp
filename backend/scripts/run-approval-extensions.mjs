/**
 * Applies admin-approval-extensions.sql when SUPABASE_DB_URL (or DATABASE_URL) is set.
 * Get the connection string from Supabase → Project Settings → Database → URI.
 *
 * Usage: npm run setup:approval
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, 'admin-approval-extensions.sql');
const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error(`
Missing SUPABASE_DB_URL or DATABASE_URL in backend/.env

Add your Postgres connection string from Supabase Dashboard:
  Project Settings → Database → Connection string → URI

Then run:  npm run setup:approval

Or paste the contents of scripts/admin-approval-extensions.sql into the Supabase SQL Editor.
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
  console.log('✅ Approval tables/columns applied successfully.');
} catch (err) {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
