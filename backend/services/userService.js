// backend/services/userService.js
import { userRepository } from '../repositories/userRepository.js';
import { supabaseAdmin } from '../config/supabase.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const userService = {
  async getUserProfile(userId) {
    const dbUser = await userRepository.findById(userId);
    
    if (!dbUser) {
      throw new NotFoundError('User not found');
    }

    let profile = null;
    switch (dbUser.role) {
      case 'reader':
        profile = await userRepository.findReaderProfile(userId);
        break;
      case 'author':
        profile = await userRepository.findAuthorProfile(userId);
        break;
      case 'publisher':
        profile = await userRepository.findPublisherProfile(userId);
        break;
      case 'admin':
        profile = await userRepository.findAdminProfile(userId);
        break;
    }

    // Format public name based on role
    let publicName = dbUser.email.split('@')[0];
    if (dbUser.role === 'reader' && profile?.display_name) {
      publicName = profile.display_name;
    } else if (dbUser.role === 'author' && profile?.pen_name) {
      publicName = profile.pen_name;
    } else if (dbUser.role === 'publisher' && profile?.company_name) {
      publicName = profile.company_name;
    } else if (dbUser.role === 'admin' && profile?.display_name) {
      publicName = profile.display_name;
    }

    return {
      id: dbUser.id,
      email: dbUser.email,
      role: dbUser.role,
      account_status: dbUser.account_status,
      is_email_verified: dbUser.is_email_verified,
      publicName,
      avatarUrl: profile?.avatar_url || null,
      bio: profile?.bio || null,
      profile: profile,
    };
  },

  async updateProfile(userId, updates) {
    // Get user to know role
    const dbUser = await userRepository.findById(userId);
    if (!dbUser) {
      throw new NotFoundError('User not found');
    }

    let updated = false;
    if (dbUser.role === 'reader') {
      updated = await userRepository.updateReaderProfile(userId, updates);
    } else {
      // For other roles, implement similar updates
      throw new ValidationError('Profile update not implemented for this role');
    }

    if (!updated) {
      throw new ValidationError('Failed to update profile');
    }

    logger.info('Profile updated', { userId, role: dbUser.role });
    return this.getUserProfile(userId);
  },

  async saveFavoriteGenres(userId, genreIds) {
    if (!genreIds || !Array.isArray(genreIds)) {
      throw new ValidationError('Genre IDs must be an array');
    }

    if (genreIds.length > 5) {
      throw new ValidationError('You can only select up to 5 genres');
    }

    const success = await userRepository.updateFavoriteGenres(userId, genreIds);
    
    if (!success) {
      throw new ValidationError('Failed to save favorite genres');
    }

    logger.info('Favorite genres saved', { userId, genreIds });
    return genreIds;
  },

  async getFavoriteGenres(userId) {
    const genres = await userRepository.findFavoriteGenres(userId);
    return genres;
  },

  async searchUsers(query, currentUserId, role = null) {
    if (!query || query.length < 2) {
      return [];
    }

    const normalizedRole = role && ['author', 'publisher', 'reader', 'admin'].includes(role) ? role : null;
    const qLike = `%${String(query).trim()}%`;

    // Role-specific search by profile name (this is what studio upload needs)
    if (normalizedRole === 'publisher') {
      const { data, error } = await supabaseAdmin
        .from('publisher_profiles')
        .select(
          `
          user_id,
          company_name,
          users!inner (
            id,
            email,
            avatar_url,
            role
          )
        `
        )
        .ilike('company_name', qLike)
        .neq('user_id', currentUserId)
        .limit(20);

      if (error) {
        logger.error('Search publishers error', { error: error.message });
        return [];
      }

      return (data || []).map((row) => ({
        id: row.user_id,
        name: row.company_name,
        email: row.users?.email,
        avatarUrl: row.users?.avatar_url,
        role: row.users?.role,
      }));
    }

    if (normalizedRole === 'author') {
      const { data, error } = await supabaseAdmin
        .from('author_profiles')
        .select(
          `
          user_id,
          pen_name,
          users!inner (
            id,
            email,
            avatar_url,
            role
          )
        `
        )
        .ilike('pen_name', qLike)
        .neq('user_id', currentUserId)
        .limit(20);

      if (error) {
        logger.error('Search authors error', { error: error.message });
        return [];
      }

      return (data || []).map((row) => ({
        id: row.user_id,
        name: row.pen_name,
        email: row.users?.email,
        avatarUrl: row.users?.avatar_url,
        role: row.users?.role,
      }));
    }

    // Fallback: search by email (and then enrich name from profile)
    let q = supabaseAdmin
      .from('users')
      .select('id, email, avatar_url, role')
      .ilike('email', qLike)
      .neq('id', currentUserId)
      .limit(20);

    if (normalizedRole) {
      q = q.eq('role', normalizedRole);
    }

    const { data: users, error } = await q;

    if (error) {
      logger.error('Search users error', { error: error.message });
      return [];
    }

    const formattedUsers = await Promise.all(
      (users || []).map(async (user) => {
        let name = user.email.split('@')[0];

        if (user.role === 'author') {
          const profile = await userRepository.findAuthorProfile(user.id);
          if (profile?.pen_name) name = profile.pen_name;
        } else if (user.role === 'publisher') {
          const profile = await userRepository.findPublisherProfile(user.id);
          if (profile?.company_name) name = profile.company_name;
        } else if (user.role === 'reader') {
          const profile = await userRepository.findReaderProfile(user.id);
          if (profile?.display_name) name = profile.display_name;
        }

        return {
          id: user.id,
          name,
          email: user.email,
          avatarUrl: user.avatar_url,
          role: user.role,
        };
      })
    );

    return formattedUsers;
  },

  async searchCommunityUsers(query, currentUserId) {
    if (!query || query.length < 2) return [];

    const qLike = `%${String(query).trim()}%`;
    const results = new Map();

    const addUser = (user) => {
      if (!user?.id || user.id === currentUserId || results.has(user.id)) return;
      results.set(user.id, user);
    };

    const { data: byEmail } = await supabaseAdmin
      .from('users')
      .select('id, email, avatar_url, role')
      .ilike('email', qLike)
      .neq('id', currentUserId)
      .limit(15);

    for (const u of byEmail || []) {
      addUser({
        id: u.id,
        name: u.email.split('@')[0],
        email: u.email,
        avatarUrl: u.avatar_url,
        role: u.role,
        username: u.email.split('@')[0],
      });
    }

    const { data: readers } = await supabaseAdmin
      .from('reader_profiles')
      .select('display_name, user_id, users!inner(id, email, avatar_url, role)')
      .ilike('display_name', qLike)
      .neq('user_id', currentUserId)
      .limit(10);

    for (const row of readers || []) {
      addUser({
        id: row.user_id,
        name: row.display_name,
        email: row.users?.email,
        avatarUrl: row.users?.avatar_url,
        role: row.users?.role,
        username: row.users?.email?.split('@')[0],
      });
    }

    const { data: authors } = await supabaseAdmin
      .from('author_profiles')
      .select('pen_name, user_id, users!inner(id, email, avatar_url, role)')
      .ilike('pen_name', qLike)
      .neq('user_id', currentUserId)
      .limit(10);

    for (const row of authors || []) {
      addUser({
        id: row.user_id,
        name: row.pen_name,
        email: row.users?.email,
        avatarUrl: row.users?.avatar_url,
        role: row.users?.role,
        username: row.users?.email?.split('@')[0],
      });
    }

    return [...results.values()].slice(0, 20);
  },
};