export const formatSuccess = (data, message = null) => ({
  success: true,
  message,
  data,
});

export const formatError = (error, statusCode = 500) => ({
  success: false,
  error: {
    message: error.message || 'Internal server error',
    code: error.errorCode || 'INTERNAL_ERROR',
    ...(error.errors && { details: error.errors }),
  },
  statusCode,
});

export const formatSessionUser = (user, profile = null, authMeta = null) => {
  let publicName = user.email.split('@')[0];
  let avatarUrl = null;

  if (user.role === 'admin') {
    const metaName =
      authMeta?.display_name?.trim() ||
      authMeta?.displayName?.trim() ||
      authMeta?.full_name?.trim() ||
      '';
    publicName =
      metaName ||
      profile?.display_name?.trim() ||
      publicName.replace(/[._]/g, ' ') ||
      'Admin User';
    if (publicName.length < 2) publicName = 'Admin User';
    avatarUrl = authMeta?.avatar_url || profile?.avatar_url || null;
    const bio = authMeta?.bio?.trim() || profile?.bio?.trim() || null;

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      account_status: user.account_status,
      publicName,
      avatarUrl,
      bio,
    };
  } else if (profile) {
    if (user.role === 'reader' && profile.display_name) {
      publicName = profile.display_name;
      avatarUrl = profile.avatar_url;
    } else if (user.role === 'author' && profile.pen_name) {
      publicName = profile.pen_name;
      avatarUrl = profile.avatar_url;
    } else if (user.role === 'publisher' && profile.company_name) {
      publicName = profile.company_name;
      avatarUrl = profile.avatar_url;
    }
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    account_status: user.account_status,
    publicName,
    avatarUrl,
  };
};

export const createAuthSession = (user, profile = null, authMeta = null) => {
  const now = new Date();
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  return {
    user: formatSessionUser(user, profile, authMeta),
    issuedAt,
    expiresAt,
  };
};