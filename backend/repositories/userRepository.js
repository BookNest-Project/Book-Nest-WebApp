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

  async findByEmail(email) {
    const normalized = (email || '').trim().toLowerCase();
    if (!normalized) return null;

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, email, role, account_status, created_at, updated_at')
      .eq('email', normalized)
      .maybeSingle();

    if (error) {
      logger.error('User findByEmail error', { email: normalized, error: error.message });
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
      .select('display_name, avatar_url, bio, created_at, updated_at')
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
    const normalizedEmail = (email || '').trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    
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

  async upsertProfileAvatar(userId, role, avatarUrl, email) {
    const defaultName =
      (email || '').split('@')[0].replace(/[._-]+/g, ' ').trim().slice(0, 80) || 'BookNest User';
    const safeName = defaultName.length >= 2 ? defaultName : 'BookNest User';
    const now = new Date().toISOString();

    if (role === 'reader') {
      const existing = await this.findReaderProfile(userId);
      const { error } = await supabaseAdmin.from('reader_profiles').upsert(
        {
          user_id: userId,
          display_name: existing?.display_name || safeName,
          avatar_url: avatarUrl,
          updated_at: now,
        },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
      return true;
    }

    if (role === 'author') {
      const existing = await this.findAuthorProfile(userId);
      const penName = existing?.pen_name || safeName;
      const { error } = await supabaseAdmin.from('author_profiles').upsert(
        {
          user_id: userId,
          pen_name: penName,
          full_name: existing?.full_name || penName,
          avatar_url: avatarUrl,
          updated_at: now,
        },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
      return true;
    }

    if (role === 'publisher') {
      const existing = await this.findPublisherProfile(userId);
      const { error } = await supabaseAdmin.from('publisher_profiles').upsert(
        {
          user_id: userId,
          company_name: existing?.company_name || safeName,
          avatar_url: avatarUrl,
          updated_at: now,
        },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
      return true;
    }

    return false;
  },

  async updateAuthorProfile(userId, updates) {
    const { error } = await supabaseAdmin
      .from('author_profiles')
      .update(updates)
      .eq('user_id', userId);

    if (error) {
      logger.error('Update author profile error', { userId, updates, error: error.message });
      return false;
    }
    return true;
  },

  async updatePublisherProfile(userId, updates) {
    const { error } = await supabaseAdmin
      .from('publisher_profiles')
      .update(updates)
      .eq('user_id', userId);

    if (error) {
      logger.error('Update publisher profile error', { userId, updates, error: error.message });
      return false;
    }
    return true;
  },

  async upsertReaderProfile(userId, updates, email) {
    const existing = await this.findReaderProfile(userId);
    const defaultName =
      (email || '').split('@')[0].replace(/[._-]+/g, ' ').trim().slice(0, 80) || 'BookNest User';
    const safeName = defaultName.length >= 2 ? defaultName : 'BookNest User';
    const row = {
      user_id: userId,
      display_name: updates.display_name ?? existing?.display_name ?? safeName,
      avatar_url: updates.avatar_url ?? existing?.avatar_url ?? null,
      bio: updates.bio !== undefined ? updates.bio : existing?.bio ?? null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabaseAdmin.from('reader_profiles').upsert(row, { onConflict: 'user_id' });
    if (error) throw error;
    return true;
  },

  async upsertAuthorProfile(userId, updates, email) {
    const existing = await this.findAuthorProfile(userId);
    const defaultName =
      (email || '').split('@')[0].replace(/[._-]+/g, ' ').trim().slice(0, 120) || 'BookNest Author';
    const safeName = defaultName.length >= 2 ? defaultName : 'BookNest Author';
    const penName = updates.pen_name ?? existing?.pen_name ?? safeName;
    const row = {
      user_id: userId,
      pen_name: penName,
      full_name: updates.full_name ?? existing?.full_name ?? penName,
      avatar_url: existing?.avatar_url ?? null,
      bio: updates.bio !== undefined ? updates.bio : existing?.bio ?? null,
      website_url: updates.website_url !== undefined ? updates.website_url : existing?.website_url ?? null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabaseAdmin.from('author_profiles').upsert(row, { onConflict: 'user_id' });
    if (error) throw error;
    return true;
  },

  async upsertPublisherProfile(userId, updates, email) {
    const existing = await this.findPublisherProfile(userId);
    const defaultName =
      (email || '').split('@')[0].replace(/[._-]+/g, ' ').trim().slice(0, 160) || 'BookNest Publisher';
    const safeName = defaultName.length >= 2 ? defaultName : 'BookNest Publisher';
    const row = {
      user_id: userId,
      company_name: updates.company_name ?? existing?.company_name ?? safeName,
      avatar_url: existing?.avatar_url ?? null,
      bio: updates.bio !== undefined ? updates.bio : existing?.bio ?? null,
      website_url: updates.website_url !== undefined ? updates.website_url : existing?.website_url ?? null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabaseAdmin.from('publisher_profiles').upsert(row, { onConflict: 'user_id' });
    if (error) throw error;
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