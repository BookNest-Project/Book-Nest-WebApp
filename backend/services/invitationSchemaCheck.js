import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

export async function warnIfInvitationSchemaMissing() {
  const { error } = await supabaseAdmin.from('admin_invitations').select('id').limit(1);
  const missing =
    error?.message?.includes('admin_invitations') ||
    error?.message?.includes('schema cache');

  if (missing) {
    logger.warn(
      'admin_invitations table missing — invitations use local file storage until you run scripts/admin-invitations.sql in Supabase SQL Editor.',
    );
  }
}
