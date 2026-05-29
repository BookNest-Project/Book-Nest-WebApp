import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

function safeDisplayName(...candidates) {
  for (const value of candidates) {
    const trimmed = (value || '').trim();
    if (trimmed.length >= 2) return trimmed.slice(0, 80);
  }
  return 'Admin User';
}

export const adminProfileRepository = {
  async findByUserId(userId) {
    const { data, error } = await supabaseAdmin
      .from('admin_profiles')
      .select('user_id, display_name, avatar_url, created_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      logger.error('Admin profile find error', { userId, error: error.message });
      return null;
    }
    return data;
  },

  async updateAvatar(userId, avatarUrl) {
    const { data, error } = await supabaseAdmin
      .from('admin_profiles')
      .update({
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select('user_id, display_name, avatar_url, created_at, updated_at')
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async updateDisplayName(userId, displayName) {
    const { data, error } = await supabaseAdmin
      .from('admin_profiles')
      .update({
        display_name: displayName,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select('user_id, display_name, avatar_url, created_at, updated_at')
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async upsertDisplayName(userId, displayName) {
    const safeName = safeDisplayName(displayName);

    const { data, error } = await supabaseAdmin
      .from('admin_profiles')
      .upsert(
        {
          user_id: userId,
          display_name: safeName,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      .select('user_id, display_name, avatar_url, created_at, updated_at')
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async upsertAvatar(userId, { avatarUrl, displayName }) {
    const existing = await this.findByUserId(userId);

    if (existing) {
      return this.updateAvatar(userId, avatarUrl);
    }

    const safeName = safeDisplayName(displayName);

    const { data, error } = await supabaseAdmin
      .from('admin_profiles')
      .insert({
        user_id: userId,
        display_name: safeName,
        avatar_url: avatarUrl,
      })
      .select('user_id, display_name, avatar_url, created_at, updated_at')
      .single();

    if (error) throw error;
    return data;
  },
};
