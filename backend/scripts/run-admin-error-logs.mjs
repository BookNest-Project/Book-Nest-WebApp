/**
 * Creates system_error_logs table when SUPABASE_DB_URL is set.
 * Otherwise run admin-error-logs.sql in Supabase SQL Editor.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(__dirname, 'admin-error-logs.sql'), 'utf8');
const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  console.log('Set SUPABASE_DB_URL in backend/.env, or run admin-error-logs.sql in Supabase SQL Editor.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();
await client.query(sql);
console.log('system_error_logs table ready.');
await client.end();
