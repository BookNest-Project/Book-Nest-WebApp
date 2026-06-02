/** Read JWT from httpOnly cookie (main app) or Authorization header (admin SPA). */
export function getAccessTokenFromRequest(req) {
  if (req.cookies?.token) {
    return req.cookies.token;
  }

  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }

  return null;
}
