import { supabase, supabaseAdmin } from '../config/supabase.js';
import { getAuthSession, loadFullUserBundle } from '../services/userService.js';
 
export const register = async (req, res) => {
  try {
    const { email, password, display_name } = req.body;

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name },
      app_metadata: { role: 'reader' },
    });

    if (authError) {
      return res.status(400).json({ 
        error: authError.message?.toLowerCase().includes('already') 
          ? 'Email already registered' 
          : authError.message 
      });
    }

    // Auto-login after registration
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      return res.status(201).json({
        message: 'Account created. Please login.',
      });
    }

    // Set HTTP-only cookie
    res.cookie('token', signInData.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    });

    const authSession = await getAuthSession(signInData.user.id);

    res.status(201).json({
      message: 'Account created and logged in successfully',
      ...authSession,
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
      password,
    });

    if (error) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    res.cookie('token', data.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    });

    const authSession = await getAuthSession(data.user.id);

    res.status(200).json({
      message: 'Login successful',
      ...authSession,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const logout = async (req, res) => {
  try {
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    res.status(200).json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ============ AUTHENTICATED ENDPOINTS ============

export const me = async (req, res) => {
  try {
    const authSession = await getAuthSession(req.user.id);
    res.status(200).json(authSession);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to load profile' });
  }
};

export const getProfile = async (req, res) => {
  try {
    const { user, profile } = await loadFullUserBundle(req.user.id);
    res.status(200).json({ user, profile });
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

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('reader_profiles')
        .update(updates)
        .eq('user_id', userId);

      if (updateError) {
        return res.status(400).json({ error: updateError.message });
      }
    }

    if (favorite_genre_ids !== undefined) {
      await supabaseAdmin
        .from('reader_favorite_genres')
        .delete()
        .eq('reader_user_id', userId);

      if (favorite_genre_ids.length > 0) {
        const rows = favorite_genre_ids.map((genreId) => ({
          reader_user_id: userId,
          genre_id: genreId,
        }));

        const { error: insertError } = await supabaseAdmin
          .from('reader_favorite_genres')
          .insert(rows);

        if (insertError) {
          return res.status(400).json({ error: insertError.message });
        }
      }
    }

    const { profile } = await loadFullUserBundle(userId);

    res.json({
      message: 'Profile updated successfully',
      profile,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};