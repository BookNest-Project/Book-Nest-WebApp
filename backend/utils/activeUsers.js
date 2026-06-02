import { supabaseAdmin } from '../config/supabase.js';

/** IDs of users whose public content should be visible. */
export async function getActiveUserIdSet() {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('account_status', 'active');

  if (error) throw error;
  return new Set((data || []).map((row) => row.id));
}

export function isActiveUser(activeIds, userId) {
  return !!userId && activeIds.has(userId);
}
