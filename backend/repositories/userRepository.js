import { supabaseAdmin } from '../config/supabase.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const userRepository = {
  async findById(userId) {
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, email, role, account_status, created_at, updated_at')
      .eq('id', userId)
      .single();

    if (error) {
      logger.error('User findById error', { userId, error: error.message });
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

  async createAuthUser(email, password, displayName) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
      app_metadata: { role: 'reader' },
    });

    if (error) {
      if (error.message?.toLowerCase().includes('already')) {
        throw new ConflictError('Email already registered');
      }
      throw error;
    }

    return data.user;
  },

  async verifyCredentials(email, password) {
    const { supabase } = await import('../config/supabase.js');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      return { user: null, session: null, error };
    }
    
    return { user: data.user, session: data.session, error: null };
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
};