import { supabase, supabaseAdmin } from '../config/supabase.js';
import { UnauthorizedError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies?.token;

    if (!token) {
      throw new UnauthorizedError('No token provided');
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      logger.warn('Invalid token', { error: error?.message });
      throw new UnauthorizedError('Invalid or expired token');
    }

    // Get user from database
    const { data: dbUser, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, role, account_status')
      .eq('id', user.id)
      .single();

    if (userError || !dbUser) {
      throw new UnauthorizedError('User not found in database');
    }

    if (dbUser.account_status !== 'active') {
      throw new UnauthorizedError('Account is not active');
    }

    // Get public name based on role
    let publicName = dbUser.email.split('@')[0];
    
    if (dbUser.role === 'author') {
      const { data: profile } = await supabaseAdmin
        .from('author_profiles')
        .select('pen_name')
        .eq('user_id', dbUser.id)
        .single();
      if (profile?.pen_name) publicName = profile.pen_name;
    } else if (dbUser.role === 'publisher') {
      const { data: profile } = await supabaseAdmin
        .from('publisher_profiles')
        .select('company_name')
        .eq('user_id', dbUser.id)
        .single();
      if (profile?.company_name) publicName = profile.company_name;
    } else if (dbUser.role === 'reader') {
      const { data: profile } = await supabaseAdmin
        .from('reader_profiles')
        .select('display_name')
        .eq('user_id', dbUser.id)
        .single();
      if (profile?.display_name) publicName = profile.display_name;
    }

    req.user = {
      id: dbUser.id,
      email: dbUser.email,
      role: dbUser.role,
      publicName: publicName,
    };

    next();
  } catch (error) {
    next(error);
  }
};

export const authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role) {
      return next(new UnauthorizedError('Not authenticated'));
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
      return next(Object.assign(new Error('Forbidden'), { name: 'ForbiddenError' }));
    }
    return next();
  };
};