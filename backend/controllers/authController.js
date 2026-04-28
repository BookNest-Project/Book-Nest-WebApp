import { supabase, supabaseAdmin } from '../config/supabase.js';

const loadProfileBundle = async (userId) => {
  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .select('id, email, role, account_status, created_at, updated_at')
    .eq('id', userId)
    .single();

  if (userError) {
    throw userError;
  }

  const bundle = { user, profile: null };

  if (user.role === 'reader') {
    const { data: readerProfile } = await supabaseAdmin
      .from('reader_profiles')
      .select('display_name, avatar_url, bio, created_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    const { data: favoriteGenres, error: favoriteGenresError } = await supabaseAdmin
      .from('reader_favorite_genres')
      .select(`
        genre_id,
        genre:genre_id (
          id,
          slug,
          name
        )
      `)
      .eq('reader_user_id', userId);

    if (favoriteGenresError) {
      throw favoriteGenresError;
    }

    bundle.profile = readerProfile
      ? {
          ...readerProfile,
          favorite_genres: (favoriteGenres || []).map((item) => item.genre).filter(Boolean)
        }
      : null;
    return bundle;
  }

  if (user.role === 'admin') {
    const { data: adminProfile } = await supabaseAdmin
      .from('admin_profiles')
      .select('display_name, avatar_url, bio, created_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    bundle.profile = adminProfile;
    return bundle;
  }

  if (user.role === 'author') {
    const { data: authorProfile } = await supabaseAdmin
      .from('author_profiles')
      .select('pen_name, full_name, bio, avatar_url, website_url, created_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    bundle.profile = authorProfile;
    return bundle;
  }

  if (user.role === 'publisher') {
    const { data: publisherProfile } = await supabaseAdmin
      .from('publisher_profiles')
      .select('company_name, avatar_url, bio, website_url, support_email, created_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    bundle.profile = publisherProfile;
  }

  return bundle;
};

export const register = async (req, res) => {
  try {
    const { email, password, display_name } = req.body;

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name
      },
      app_metadata: {
        role: 'reader'
      }
    });

    if (authError) {
      if (authError.message?.toLowerCase().includes('already')) {
        return res.status(400).json({ error: 'Email already registered' });
      }
      return res.status(400).json({ error: authError.message });
    }

    const { error: profileError } = await supabaseAdmin
      .from('reader_profiles')
      .insert({
        user_id: authData.user.id,
        display_name
      });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return res.status(500).json({ error: 'Failed to create reader profile' });
    }

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    const profile = await loadProfileBundle(authData.user.id);

    if (signInError) {
      return res.status(201).json({
        message: 'Reader account created successfully. Please login.',
        user: profile
      });
    }

    res.status(201).json({
      message: 'Reader account created successfully',
      token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
      user: profile
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const profile = await loadProfileBundle(data.user.id);

    res.json({
      message: 'Login successful',
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: profile
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getProfile = async (req, res) => {
  try {
    const profile = await loadProfileBundle(req.user.id);
    res.json(profile);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to load profile' });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { display_name, avatar_url, bio, favorite_genre_ids } = req.body;

    if (req.user.role !== 'reader') {
      return res.status(403).json({ error: 'Only reader profiles can be updated here' });
    }

    const updates = {};
    if (display_name !== undefined) updates.display_name = display_name;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url || null;
    if (bio !== undefined) updates.bio = bio || null;

    let data = null;

    if (Object.keys(updates).length > 0) {
      const result = await supabaseAdmin
        .from('reader_profiles')
        .update(updates)
        .eq('user_id', userId)
        .select('display_name, avatar_url, bio, created_at, updated_at')
        .single();

      data = result.data;

      if (result.error) {
        return res.status(400).json({ error: result.error.message });
      }
    } else {
      const result = await supabaseAdmin
        .from('reader_profiles')
        .select('display_name, avatar_url, bio, created_at, updated_at')
        .eq('user_id', userId)
        .single();

      data = result.data;

      if (result.error) {
        return res.status(400).json({ error: result.error.message });
      }
    }

    if (favorite_genre_ids !== undefined) {
      const { error: deleteError } = await supabaseAdmin
        .from('reader_favorite_genres')
        .delete()
        .eq('reader_user_id', userId);

      if (deleteError) {
        return res.status(400).json({ error: deleteError.message });
      }

      if (favorite_genre_ids.length > 0) {
        const rows = favorite_genre_ids.map((genreId) => ({
          reader_user_id: userId,
          genre_id: genreId
        }));

        const { error: insertError } = await supabaseAdmin
          .from('reader_favorite_genres')
          .insert(rows);

        if (insertError) {
          return res.status(400).json({ error: insertError.message });
        }
      }
    }

    const profile = await loadProfileBundle(userId);

    res.json({
      message: 'Profile updated successfully',
      profile: profile.profile
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const logout = async (req, res) => {
  try {
    res.json({ message: 'Logout successful. Discard the token on the client.' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
