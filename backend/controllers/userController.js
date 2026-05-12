import { authService } from '../services/authService.js';
import { profileService } from '../services/profileService.js';
import { validateRegister, validateLogin } from '../validators/userValidator.js';
import { formatSuccess } from '../utils/responseFormatter.js';
import { logger } from '../utils/logger.js';
import { supabase, supabaseAdmin } from '../config/supabase.js';

export const userController = {
  async register(req, res, next) {
    try {
      validateRegister(req.body);
      const { email, password, display_name } = req.body;
      
      await authService.register(email, password, display_name);
      
      // Auto-login after registration
      const loginResult = await authService.login(email, password);
      
      res.cookie('token', loginResult.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
      });

      logger.info('Registration successful', { email });
      
      res.status(201).json(
        formatSuccess(loginResult.session, 'Account created and logged in successfully')
      );
    } catch (error) {
      next(error);
    }
  },

  async login(req, res, next) {
    try {
      validateLogin(req.body);
      const { email, password } = req.body;
      
      const result = await authService.login(email, password);
      
      res.cookie('token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
      });

      logger.info('Login successful', { email });
      
      res.status(200).json(formatSuccess(result.session, 'Login successful'));
    } catch (error) {
      next(error);
    }
  },

  async logout(req, res, next) {
    try {
      authService.logout();
      
      res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });

      res.status(200).json(formatSuccess(null, 'Logout successful'));
    } catch (error) {
      next(error);
    }
  },

  async me(req, res, next) {
    try {
      const session = await authService.getUserSession(req.user.id);
      res.status(200).json(formatSuccess(session));
    } catch (error) {
      next(error);
    }
  },

  async getProfile(req, res, next) {
    try {
      const profile = await profileService.getProfile(req.user.id);
      res.status(200).json(formatSuccess(profile));
    } catch (error) {
      next(error);
    }
  },

  async updateProfile(req, res, next) {
    try {
      const updatedProfile = await profileService.updateReaderProfile(req.user.id, req.body);
      res.status(200).json(formatSuccess(updatedProfile, 'Profile updated successfully'));
    } catch (error) {
      next(error);
    }
  },
  /**
 * Get user suggestions by role (for author/publisher search)
 * GET /api/users/suggest
 */
async getSuggestions(req, res, next) {
  try {
        console.log('Suggestions request received');
    console.log('User from token:', req.user);
    
    const { role, q } = req.query;
    console.log('Role:', role, 'Query:', q); 
    if (!role || !['author', 'publisher'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Valid role (author or publisher) is required' },
      });
    }

    let suggestions = [];

    if (role === 'author') {
      // Search author profiles
      let query = supabaseAdmin
        .from('author_profiles')
        .select('user_id, pen_name')
        .limit(10);

      if (q && q.length >= 2) {
        query = query.ilike('pen_name', `%${q}%`);
      }

      const { data: profiles, error } = await query;

      if (!error && profiles) {
        suggestions = profiles.map(profile => ({
          id: profile.user_id,
          name: profile.pen_name,
        }));
      }
    } else if (role === 'publisher') {
      // Search publisher profiles
      let query = supabaseAdmin
        .from('publisher_profiles')
        .select('user_id, company_name')
        .limit(10);

      if (q && q.length >= 2) {
        query = query.ilike('company_name', `%${q}%`);
      }

      const { data: profiles, error } = await query;

      if (!error && profiles) {
        suggestions = profiles.map(profile => ({
          id: profile.user_id,
          name: profile.company_name,
        }));
      }
    }

    return res.status(200).json({
      success: true,
      data: suggestions,
    });
  } catch (error) {
    console.error('Suggestions error:', error);
    next(error);
  }
},
/**
 * Save reader's favorite genres
 * POST /api/users/favorite-genres
 */
async saveFavoriteGenres(req, res, next) {
  try {
    const userId = req.user.id;
    const { genre_ids } = req.body;

    console.log('Saving favorite genres for user:', userId);
    console.log('Genre IDs:', genre_ids);

    if (!genre_ids || !Array.isArray(genre_ids) || genre_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: { message: 'At least one genre is required' },
      });
    }

    // ✅ Add 5 genre limit
    if (genre_ids.length > 5) {
      return res.status(400).json({
        success: false,
        error: { message: 'You can only select up to 5 genres' },
      });
    }

    // Delete existing favorites
    const { error: deleteError } = await supabaseAdmin
      .from('reader_favorite_genres')
      .delete()
      .eq('reader_user_id', userId);

    if (deleteError) {
      console.error('Delete error:', deleteError);
      return res.status(500).json({ success: false, error: { message: deleteError.message } });
    }

    // Insert new favorites
    const rows = genre_ids.map(genre_id => ({
      reader_user_id: userId,
      genre_id: genre_id,
    }));

    const { error: insertError } = await supabaseAdmin
      .from('reader_favorite_genres')
      .insert(rows);

    if (insertError) {
      console.error('Insert error:', insertError);
      return res.status(500).json({ success: false, error: { message: insertError.message } });
    }

    logger.info('Favorite genres saved', { userId, genres: genre_ids });

    res.status(200).json({
      success: true,
      data: { genre_ids },
      message: 'Favorite genres saved successfully'
    });
  } catch (error) {
    console.error('Save favorite genres error:', error);
    next(error);
  }
},

/**
 * Get reader's favorite genres
 * GET /api/users/favorite-genres
 */
async getFavoriteGenres(req, res, next) {
  try {
    const userId = req.user.id;

    const { data: favorites, error } = await supabaseAdmin
      .from('reader_favorite_genres')
      .select(`
        genre_id,
        genre:genre_id (
          id,
          name,
          slug
        )
      `)
      .eq('reader_user_id', userId);

    if (error) throw error;

    const genres = favorites.map(f => f.genre).filter(Boolean);

    res.status(200).json({
      success: true,
      data: genres,
      message: 'Favorite genres retrieved'
    });
  } catch (error) {
    console.error('Get favorite genres error:', error);
    next(error);
  }
},
/**
 * Request password reset
 * POST /api/auth/forgot-password
 */
async forgotPassword(req, res, next) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: { message: 'Email is required' },
      });
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL}/update-password`,
    });

    if (error) throw error;

    logger.info('Password reset email sent', { email });

    res.status(200).json({
      success: true,
      message: 'Password reset email sent. Check your inbox.',
    });
  } catch (error) {
    next(error);
  }
},

/**
 * Update password
 * POST /api/auth/update-password
 */
async updatePassword(req, res, next) {
  try {
    const { access_token, password } = req.body;

    if (!access_token || !password) {
      return res.status(400).json({
        success: false,
        error: { message: 'Access token and password are required' },
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: { message: 'Password must be at least 6 characters' },
      });
    }

    // Update user password using the access token from email link
    const supabaseClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        },
      }
    );

    const { error } = await supabaseClient.auth.updateUser({
      password: password,
    });

    if (error) throw error;

    logger.info('Password updated successfully');

    res.status(200).json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    next(error);
  }
},
};