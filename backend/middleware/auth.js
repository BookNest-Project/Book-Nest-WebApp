import { supabaseAdmin } from '../config/supabase.js';
import { supabase } from '../config/supabase.js';

export const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies?.token;
    
    console.log('Cookie received:', token ? 'Token exists' : 'No token');
    
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // ✅ VERIFY THE TOKEN with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    console.log('Verification result:', { user: user?.id, error: error?.message });
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Get user from your database
    const { data: dbUser, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, role, account_status')
      .eq('id', user.id)
      .single();

    if (userError || !dbUser) {
      return res.status(404).json({ error: 'User not found in database' });
    }

    if (dbUser.account_status !== 'active') {
      return res.status(403).json({ error: 'Account is not active' });
    }

    req.user = {
      id: dbUser.id,
      email: dbUser.email,
      role: dbUser.role
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

export const authorize = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Access denied',
        required_roles: allowedRoles,
        your_role: req.user.role
      });
    }

    next();
  };
};
