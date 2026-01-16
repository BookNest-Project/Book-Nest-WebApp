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


    // 🔥🔥🔥 THIS IS THE FIX - Generate login token for immediate access
    console.log('🔑 Generating login token...');
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (signInError) {
      console.warn('⚠️ Could not generate immediate login token:', signInError.message);
      // User created but needs to login manually
      res.status(201).json({
        message: 'User registered successfully. Please login with your credentials.',
        user: dbUser
      });
    } else {
      // Success! User registered AND logged in immediately
      console.log('✅ Token generated successfully');
      res.status(201).json({
        message: 'User registered and logged in successfully',
        user: dbUser,
        token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token
      });
    }
 
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
    const userRole = req.user.role;  // From middleware

    console.log(`👤 Profile request for user: ${userId} (${userRole})`);

    // Step 1: Fetch basic user info (same as before)
    const { data: basicUser, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, role, display_name, bio, avatar_url, created_at')
      .eq('id', userId)
      .single();

    if (userError) {
      console.error('❌ Basic user fetch error:', userError);
      return res.status(404).json({ error: 'User not found' });
    }

    // Step 2: Prepare response object
    const profile = {
      user: basicUser,
      additionalData: {}  // We'll add role-specific stuff here
    };

    // Step 3: Role-specific fetches
    if (userRole === 'reader') {
      // Fetch owned book formats (what they purchased)
      const { data: ownedFormats, error: formatsError } = await supabaseAdmin
        .from('user_book_formats')
        .select(`
          id,
          purchased_at,
          book_format:book_format_id (
            id,
            format_type,
            price,
            book:book_id (
              id,
              title,
              description,
              author_name,
              cover_image_url
            )
          )
        `)
        .eq('user_id', userId)
        .order('purchased_at', { ascending: false });

      if (formatsError) {
        console.error('❌ Owned formats error:', formatsError);
        return res.status(500).json({ error: 'Failed to fetch owned books' });
      }

      // Fetch progress for each owned format
      const { data: progressData, error: progressError } = await supabaseAdmin
        .from('user_progress')
        .select('book_format_id, last_position, progress_percentage, updated_at')
        .eq('user_id', userId);

      if (progressError) {
        console.error('❌ Progress error:', progressError);
        return res.status(500).json({ error: 'Failed to fetch reading progress' });
      }

      // Fetch yearly reading stats
      const { data: yearlyData, error: yearlyError } = await supabaseAdmin
        .from('user_yearly_reading')
        .select('year, yearly_goal_books, books_completed, updated_at')
        .eq('user_id', userId)
        .order('year', { ascending: false });

      if (yearlyError) {
        console.error('❌ Yearly reading error:', yearlyError);
        return res.status(500).json({ error: 'Failed to fetch yearly reading data' });
      }

      // Add to response
      profile.additionalData = {
        ownedBooks: ownedFormats,  // Includes book details
        progress: progressData,    // Array of progress per book_format
        yearlyReading: yearlyData  // Goals and completed per year
      };
    } else if (userRole === 'author' || userRole === 'publisher') {
      // Fetch books they uploaded or are associated with
      let query = supabaseAdmin
        .from('books')
        .select(`
          id,
          title,
          description,
          created_at,
          cover_image_url,
          author_name,
          publisher_name,
          formats:book_formats (
            id,
            format_type,
            price,
            page_count,
            duration_sec
          )
        `);

      // For authors: books where author_id = userId
      // For publishers: books where publisher_id = userId
      // Also include if uploaded_by = userId
      if (userRole === 'author') {
        query = query.eq('author_id', userId);
      } else if (userRole === 'publisher') {
        query = query.eq('publisher_id', userId);
      }
      // OR uploaded_by (for both)
      query = query.or(`uploaded_by.eq.${userId}`);

      query = query.order('created_at', { ascending: false });

      const { data: booksData, error: booksError } = await query;

      if (booksError) {
        console.error('❌ Books fetch error:', booksError);
        return res.status(500).json({ error: 'Failed to fetch uploaded books' });
      }

      // Add to response
      profile.additionalData = {
        uploadedBooks: booksData  // Includes formats
      };
    }

    // Step 4: Send response
    res.json(profile);

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