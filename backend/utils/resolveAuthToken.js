import { supabase } from '../config/supabase.js';
import { logger } from './logger.js';

const refreshInflight = new Map();
/** @type {Map<string, { accessToken: string, expiresAt: number }>} */
const accessCache = new Map();

/** Supabase access JWTs are three segments starting with eyJ; refresh tokens are opaque. */
export function looksLikeJwtAccessToken(value) {
  const parts = String(value).split('.');
  return parts.length === 3 && parts[0].startsWith('eyJ');
}

export function isRefreshToken(value) {
  return Boolean(value && value.length >= 8 && !looksLikeJwtAccessToken(value));
}

/**
 * Exchange Supabase refresh token for access JWT, or pass through existing JWT.
 * Deduplicates parallel refresh calls (rotation invalidates token on reuse).
 */
export async function resolveAuthToken(token) {
  if (!token) return null;

  if (!isRefreshToken(token)) {
    return token;
  }

  const cached = accessCache.get(token);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  if (refreshInflight.has(token)) {
    return refreshInflight.get(token);
  }

  const promise = (async () => {
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: token,
    });

    if (error || !data.session?.access_token) {
      logger.warn('Refresh token exchange failed', { error: error?.message });
      return null;
    }

    const { access_token: accessToken, refresh_token: newRefresh, expires_in } =
      data.session;
    const expiresAt = Date.now() + (expires_in ?? 3600) * 1000 - 60_000;

    accessCache.set(token, { accessToken, expiresAt });
    if (newRefresh && newRefresh !== token) {
      accessCache.set(newRefresh, { accessToken, expiresAt });
      accessCache.delete(token);
    }

    return accessToken;
  })().finally(() => {
    refreshInflight.delete(token);
  });

  refreshInflight.set(token, promise);
  return promise;
}
