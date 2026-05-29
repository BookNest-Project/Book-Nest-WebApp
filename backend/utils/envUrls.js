/**
 * Normalize env URLs for Chapa (requires absolute https URLs in production).
 */

function normalizeBaseUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;

  let url = raw.trim().replace(/\/+$/, '');
  if (!url) return null;

  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

function pickFirstUrl(candidates) {
  for (const raw of candidates) {
    const normalized = normalizeBaseUrl(raw);
    if (normalized) return normalized;
  }
  return null;
}

/** Public API base (Railway / local). Used for Chapa callback_url webhook. */
export function getBackendUrl() {
  const url = pickFirstUrl([
    process.env.BACKEND_URL,
    process.env.RAILWAY_STATIC_URL,
    process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : null,
  ]);

  if (url) return url;

  if (process.env.NODE_ENV !== 'production') {
    const local = normalizeBaseUrl(`http://localhost:${process.env.PORT || 5000}`);
    if (local) return local;
  }

  throw new Error(
    'BACKEND_URL is missing or invalid. On Railway set BACKEND_URL=https://book-nest-webapp-production.up.railway.app (no trailing slash)'
  );
}

/** Vercel / local frontend. Used for Chapa return_url after payment. */
export function getFrontendUrl() {
  const url = pickFirstUrl([process.env.FRONTEND_URL]);

  if (url) return url;

  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:3000';
  }

  throw new Error(
    'FRONTEND_URL is missing or invalid. Set it to your Vercel URL, e.g. https://book-nest-frontend-v2-main.vercel.app'
  );
}

export function logResolvedUrls(logger) {
  try {
    logger.info('Resolved public URLs', {
      backend: getBackendUrl(),
      frontend: getFrontendUrl(),
      chapa_callback: `${getBackendUrl()}/api/webhooks/chapa`,
    });
  } catch (err) {
    logger.error('URL configuration error', { message: err.message });
  }
}
