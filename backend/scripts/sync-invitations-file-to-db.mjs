/**
 * Copies local JSON invitations into Supabase admin_invitations when the table exists.
 * Usage: node scripts/sync-invitations-file-to-db.mjs
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { supabaseAdmin } from '../config/supabase.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.resolve(__dirname, '../data/admin-invitations.json');

async function main() {
  const { error: probeError } = await supabaseAdmin.from('admin_invitations').select('id').limit(1);
  if (probeError) {
    console.error(
      'admin_invitations table not found. Run backend/scripts/admin-invitations.sql in Supabase SQL Editor first.',
    );
    console.error(probeError.message);
    process.exit(1);
  }

  let rows = [];
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    rows = JSON.parse(raw);
    if (!Array.isArray(rows)) rows = [];
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('No local invitation file to sync.');
      process.exit(0);
    }
    throw err;
  }

  if (!rows.length) {
    console.log('Local invitation file is empty.');
    process.exit(0);
  }

  let synced = 0;
  for (const row of rows) {
    const payload = {
      id: row.id,
      recipient_name: row.recipient_name,
      recipient_email: row.recipient_email,
      role_type: row.role_type,
      subject: row.subject,
      message: row.message,
      invitation_token: row.invitation_token,
      status: row.status === 'pending' && !row.sent_at ? 'draft' : row.status === 'pending' ? 'sent' : row.status,
      expires_at: row.expires_at,
      created_by: row.created_by,
      sent_at: row.sent_at ?? null,
      accepted_at: row.accepted_at ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };

    const { error } = await supabaseAdmin.from('admin_invitations').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.warn(`Skip ${row.recipient_email}:`, error.message);
    } else {
      synced += 1;
    }
  }

  console.log(`✅ Synced ${synced}/${rows.length} invitation(s) to Supabase.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
