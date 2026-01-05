import { supabase, supabaseAdmin } from '../config/supabase.js';

/**
 * Register a new user
 * 1. Creates user in Supabase Auth
 * 2. Creates record in our users table
 * 3. Sets initial role
 */
export const register = async (req, res) => {
  try {
    const { email, password, display_name, role = 'reader' } = req.body;

    // Validate required fields
    if (!display_name) {
      return res.status(400).json({ error: 'display_name is required' });
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { 
        display_name,
        role 
      }
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        return res.status(400).json({ error: 'Email already registered' });
      }
      return res.status(400).json({ error: authError.message });
    }

    // The trigger already created/updated the public.users row!
    // Just fetch it to return nice response
    const { data: dbUser, error: dbError } = await supabaseAdmin
      .from('users')
      .select('id, email, role, display_name')
      .eq('id', authData.user.id)
      .single();

    if (dbError) {
      // This should rarely happen now
      console.error('Failed to fetch created user:', dbError);
      // Optional: clean up auth user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return res.status(500).json({ error: 'Failed to finalize user creation' });
    }

    // Generate session (optional but nice for immediate login)
    const { data: sessionData } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email,
      password
    }); // Or use createSession if available

    res.status(201).json({
      message: 'User registered successfully',
      user: dbUser,
      // token if you generated one
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Login existing user
 * Returns JWT token for API access
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔑 Login attempt for:', email);

    // Use regular supabase client (not admin) for login
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error('❌ Login error:', error.message);
      
      if (error.message.includes('Invalid login credentials')) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      
      return res.status(400).json({ error: error.message });
    }

    console.log('✅ Login successful for:', data.user.id);

    // Get user details from database
    const { data: dbUser, error: dbError } = await supabaseAdmin
      .from('users')
      .select('id, email, role, display_name, avatar_url')
      .eq('id', data.user.id)
      .single();

    if (dbError) {
      console.error('❌ Database fetch error:', dbError);
      return res.status(404).json({ error: 'User profile not found' });
    }

    res.json({
      message: 'Login successful',
      token: data.session.access_token,  // JWT token
      refresh_token: data.session.refresh_token,
      user: {
        id: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
        display_name: dbUser.display_name,
        avatar_url: dbUser.avatar_url
      }
    });

  } catch (error) {
    console.error('🔥 Unexpected error in login:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get current user profile
 * Requires authentication middleware
 */
export const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    console.log('👤 Profile request for:', userId);

    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, email, role, display_name, bio, avatar_url, created_at')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('❌ Profile fetch error:', error);
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: data
    });

  } catch (error) {
    console.error('🔥 Unexpected error in getProfile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Update user profile
 */
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { display_name, bio, avatar_url } = req.body;

    console.log('🔄 Profile update for:', userId);

    // Only update allowed fields
    const updates = {};
    if (display_name !== undefined) updates.display_name = display_name;
    if (bio !== undefined) updates.bio = bio;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select('id, email, role, display_name, bio, avatar_url')
      .single();

    if (error) {
      console.error('❌ Profile update error:', error);
      return res.status(400).json({ error: error.message });
    }

    console.log('✅ Profile updated for:', userId);

    res.json({
      message: 'Profile updated successfully',
      user: data
    });

  } catch (error) {
    console.error('🔥 Unexpected error in updateProfile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Logout (invalidate token)
 * Note: Supabase tokens are stateless, so we just respond success
 */
export const logout = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (token) {
      // You could add token to a blacklist here if needed
      console.log('🚪 Logout for token:', token.substring(0, 20) + '...');
    }

    res.json({
      message: 'Logout successful. Please discard your token.'
    });

  } catch (error) {
    console.error('🔥 Unexpected error in logout:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};