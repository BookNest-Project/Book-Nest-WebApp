import { supabaseAdmin } from '../config/supabase.js';

/**
 * Middleware to verify JWT from Supabase
 * Extracts user ID and adds to request
 */
export const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify token with Supabase (no jsonwebtoken needed!)
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error || !user) {
      console.error('Token verification error:', error?.message);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Get user role from database
    const { data: dbUser, error: dbError } = await supabaseAdmin
      .from('users')
      .select('role, display_name, id')
      .eq('id', user.id)
      .single();

    if (dbError) {
      console.error('Database user fetch error:', dbError);
      return res.status(404).json({ error: 'User not found in database' });
    }

    // Add user info to request object
    req.user = {
      id: user.id,
      email: user.email,
      role: dbUser.role,
      displayName: dbUser.display_name
    };

    console.log(`✅ Authenticated user: ${dbUser.display_name} (${dbUser.role})`);
    next();

  } catch (error) {
    console.error('🔥 Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

/**
 * Middleware to check if user has required role
 * @param {string[]} allowedRoles - Array of allowed roles
 */
export const authorize = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
        yourRole: req.user.role
      });
    }

    next();
  };
};