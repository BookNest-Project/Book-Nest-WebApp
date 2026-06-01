/**
 * Applies admin-book-review-workflow.sql when SUPABASE_DB_URL is set.
 * Otherwise prints instructions for Supabase SQL editor.
 */
import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, 'admin-book-review-workflow.sql');
const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  console.log('Set SUPABASE_DB_URL (direct Postgres) or run this file in Supabase SQL editor:');
  console.log(sqlPath);
  process.exit(0);
}

const sql = readFileSync(sqlPath, 'utf8');
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(sql);
  console.log('Book review workflow schema applied.');
} catch (err) {
  console.error(err.message);
  process.exit(1);
} finally {
  await client.end();
}
