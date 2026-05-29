import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

export async function warnIfApprovalSchemaMissing() {
  const { error: msgError } = await supabaseAdmin
    .from('author_messages')
    .select('id')
    .limit(1);

  const { error: noteError } = await supabaseAdmin
    .from('books')
    .select('review_note')
    .limit(1);

  const missingMessages =
    msgError?.message?.includes('author_messages') ||
    msgError?.message?.includes('schema cache');
  const missingReviewNote = noteError?.message?.includes('review_note');

  if (missingMessages || missingReviewNote) {
    logger.warn(
      'Admin approval schema incomplete — reject/approve notifications will be limited. Run: npm run setup:approval (needs SUPABASE_DB_URL) or paste scripts/admin-approval-extensions.sql into Supabase SQL Editor.',
      { missingMessages, missingReviewNote },
    );
  }
}
