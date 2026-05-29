// backend/repositories/userRepository.js
import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

export const userRepository = {
  async findById(userId) {
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, email, role, account_status, is_email_verified, created_at, updated_at')
      .eq('id', userId)
      .single();

    if (error) {
      logger.error('User findById error', { userId, error: error.message });
      return null;
    }
    return user;
  },

  async findByEmail(email) {
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, email, role, account_status, is_email_verified, created_at, updated_at')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      logger.error('User findByEmail error', { email, error: error.message });
      return null;
    }
    return user;
  },

  async findReaderProfile(userId) {
    const { data: profile, error } = await supabaseAdmin
      .from('reader_profiles')
      .select('display_name, avatar_url, bio, created_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      logger.error('Reader profile find error', { userId, error: error.message });
      return null;
    }
    return profile;
  },

  async findAuthorProfile(userId) {
    const { data: profile, error } = await supabaseAdmin
      .from('author_profiles')
      .select('pen_name, full_name, bio, avatar_url, website_url, created_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      logger.error('Author profile find error', { userId, error: error.message });
      return null;
    }
    return profile;
  },

  async findPublisherProfile(userId) {
    const { data: profile, error } = await supabaseAdmin
      .from('publisher_profiles')
      .select('company_name, avatar_url, bio, website_url, support_email, created_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      logger.error('Publisher profile find error', { userId, error: error.message });
      return null;
    }
    return profile;
  },

  async findAdminProfile(userId) {
    const { data: profile, error } = await supabaseAdmin
      .from('admin_profiles')
      .select('display_name, avatar_url, created_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      logger.error('Admin profile find error', { userId, error: error.message });
      return null;
    }
    return profile;
  },

  async findFavoriteGenres(userId) {
    const { data: genres, error } = await supabaseAdmin
      .from('reader_favorite_genres')
      .select(`
        genre_id,
        genre:genre_id (id, slug, name)
      `)
      .eq('reader_user_id', userId);

    if (error) {
      logger.error('Favorite genres find error', { userId, error: error.message });
      return [];
    }

    return (genres || []).map(item => item.genre).filter(Boolean);
  },

  async updateReaderProfile(userId, updates) {
    const { error } = await supabaseAdmin
      .from('reader_profiles')
      .update(updates)
      .eq('user_id', userId);

    if (error) {
      logger.error('Update reader profile error', { userId, updates, error: error.message });
      return false;
    }
    return true;
  },

  async updateFavoriteGenres(userId, genreIds) {
    await supabaseAdmin
      .from('reader_favorite_genres')
      .delete()
      .eq('reader_user_id', userId);

    if (genreIds.length === 0) return true;

    const rows = genreIds.map(genreId => ({
      reader_user_id: userId,
      genre_id: genreId,
    }));

    const { error } = await supabaseAdmin
      .from('reader_favorite_genres')
      .insert(rows);

    if (error) {
      logger.error('Update favorite genres error', { userId, genreIds, error: error.message });
      return false;
    }
    return true;
  },

  async updateEmailVerification(userId, isVerified, verifiedAt = null) {
    const payload = {
      is_email_verified: isVerified,
      updated_at: new Date().toISOString(),
    };

    if (isVerified && verifiedAt) {
      payload.email_verified_at = verifiedAt;
    }

    const { error } = await supabaseAdmin
      .from('users')
      .update(payload)
      .eq('id', userId);

    if (error) {
      logger.error('Update email verification error', { userId, error: error.message });
      return false;
    }
    return true;
  },

  async isDisplayNameTaken(displayName, excludeUserId = null) {
    const trimmed = displayName.trim();
    let query = supabaseAdmin
      .from('reader_profiles')
      .select('user_id')
      .ilike('display_name', trimmed)
      .limit(1);

    if (excludeUserId) {
      query = query.neq('user_id', excludeUserId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      logger.error('Display name check error', { displayName: trimmed, error: error.message });
      return false;
    }
    return !!data;
  },

  /**
   * Create or update reader profile (Supabase trigger may already insert a row).
   */
  async upsertReaderProfile(userId, displayName) {
    const trimmed = displayName.trim();

    const { data: existing } = await supabaseAdmin
      .from('reader_profiles')
      .select('user_id, display_name')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      if (existing.display_name?.toLowerCase() === trimmed.toLowerCase()) {
        return true;
      }

      const taken = await this.isDisplayNameTaken(trimmed, userId);
      if (taken) {
        throw new Error('DISPLAY_NAME_TAKEN');
      }

      const { error } = await supabaseAdmin
        .from('reader_profiles')
        .update({ display_name: trimmed })
        .eq('user_id', userId);

      if (error) {
        logger.error('Update reader profile error', { userId, error: error.message });
        if (error.code === '23505') {
          throw new Error('DISPLAY_NAME_TAKEN');
        }
        throw error;
      }
      return true;
    }

    const taken = await this.isDisplayNameTaken(trimmed);
    if (taken) {
      throw new Error('DISPLAY_NAME_TAKEN');
    }

    const { error } = await supabaseAdmin.from('reader_profiles').insert({
      user_id: userId,
      display_name: trimmed,
    });

    if (error) {
      logger.error('Create reader profile error', { userId, error: error.message });
      if (error.code === '23505') {
        if (error.message?.includes('reader_profiles_pkey')) {
          const { error: updateError } = await supabaseAdmin
            .from('reader_profiles')
            .update({ display_name: trimmed })
            .eq('user_id', userId);
          if (updateError) {
            if (updateError.code === '23505') {
              throw new Error('DISPLAY_NAME_TAKEN');
            }
            throw updateError;
          }
          return true;
        }
        throw new Error('DISPLAY_NAME_TAKEN');
      }
      throw error;
    }
    return true;
  },
};