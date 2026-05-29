/**
 * Auth cookie options. Do NOT set secure: true on http://localhost — browsers
 * and Postman will not store/send the cookie and every protected route returns 401.
 */
export const getAuthCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === 'true',
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 7,
});

export const getClearCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === 'true',
  sameSite: 'lax',
});
