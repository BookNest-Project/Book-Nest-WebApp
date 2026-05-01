// backend/services/userService.js
import { supabaseAdmin } from '../config/supabase.js';
import { formatSessionUser } from '../utils/responseFormatter.js';

export const loadFullUserBundle = async (userId) => {
  // 1. Get user
  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .select('id, email, role, account_status, created_at, updated_at')
    .eq('id', userId)
    .single();

  if (userError) {
    throw new Error('User not found');
  }

  let profile = null;

  // 2. Role-based profile fetching
  switch (user.role) {
    case 'reader':
      const { data: readerProfile } = await supabaseAdmin
        .from('reader_profiles')
        .select('display_name, avatar_url, bio, created_at, updated_at')
        .eq('user_id', userId)
        .maybeSingle();

      const { data: favoriteGenres } = await supabaseAdmin
        .from('reader_favorite_genres')
        .select(`
          genre_id,
          genre:genre_id (id, slug, name)
        `)
        .eq('reader_user_id', userId);

      profile = readerProfile
        ? {
            ...readerProfile,
            favorite_genres: (favoriteGenres || []).map((item) => item.genre).filter(Boolean),
          }
        : null;
      break;

    case 'author':
      const { data: authorProfile } = await supabaseAdmin
        .from('author_profiles')
        .select('pen_name, full_name, bio, avatar_url, website_url, created_at, updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      profile = authorProfile;
      break;

    case 'publisher':
      const { data: publisherProfile } = await supabaseAdmin
        .from('publisher_profiles')
        .select('company_name, avatar_url, bio, website_url, support_email, created_at, updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      profile = publisherProfile;
      break;

    case 'admin':
      const { data: adminProfile } = await supabaseAdmin
        .from('admin_profiles')
        .select('display_name, avatar_url, created_at, updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      profile = adminProfile;
      break;
  }

  return { user, profile };
};

export const getAuthSession = async (userId) => {
  const { user, profile } = await loadFullUserBundle(userId);
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  return {
    session: {
      user: formatSessionUser(user, profile),
      issuedAt,
      expiresAt,
    },
  };
};