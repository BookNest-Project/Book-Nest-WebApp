// backend/utils/responseFormatter.js

/**
 * Format user into SessionUser expected by frontend
 */
export const formatSessionUser = (user, profile = null) => {
  // Determine public name based on role
  let publicName = user.email.split('@')[0];
  let avatarUrl = null;

  if (profile) {
    if (user.role === 'reader' && profile.display_name) {
      publicName = profile.display_name;
      avatarUrl = profile.avatar_url;
    } else if (user.role === 'author' && profile.pen_name) {
      publicName = profile.pen_name;
      avatarUrl = profile.avatar_url;
    } else if (user.role === 'publisher' && profile.company_name) {
      publicName = profile.company_name;
      avatarUrl = profile.avatar_url;
    } else if (user.role === 'admin' && profile.display_name) {
      publicName = profile.display_name;
      avatarUrl = profile.avatar_url;
    }
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    account_status: user.account_status,
    publicName: publicName,
    avatarUrl: avatarUrl,
  };
};

/**
 * Create auth session response
 */
export const createAuthSession = (user, profile = null) => {
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