import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

/** Keys that must survive text-only profile saves */
function preservedAvatarFields(meta = {}) {
  const out = {};
  if (meta.avatar_url) out.avatar_url = meta.avatar_url;
  if (meta.avatarUrl) out.avatarUrl = meta.avatarUrl;
  return out;
}

export function mergeAuthProfileMetadata(existingMeta = {}, { displayName, bio } = {}) {
  const next = { ...existingMeta, ...preservedAvatarFields(existingMeta) };

  if (displayName !== undefined) {
    next.display_name = displayName;
    next.displayName = displayName;
  }
  if (bio !== undefined) {
    next.bio = bio || null;
  }

  return next;
}

export async function saveAvatarToAuthMetadata(userId, avatarUrl) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error) {
    logger.error('Auth user fetch failed', { userId, error: error.message });
    throw new Error('Failed to update profile photo');
  }

  const meta = data?.user?.user_metadata || {};
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...meta,
      avatar_url: avatarUrl,
      avatarUrl,
    },
  });

  if (updateError) {
    logger.error('Auth metadata update failed', { userId, error: updateError.message });
    throw new Error('Failed to save profile photo');
  }
}

export function defaultProfileNameFromEmail(email) {
  const base = (email || '').split('@')[0].replace(/[._-]+/g, ' ').trim();
  if (base.length >= 2) return base.slice(0, 80);
  return 'BookNest User';
}
