import { supabaseAdmin } from '../config/supabase.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.slice('Bearer '.length);
    const {
      data: { user },
      error: authError
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

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
