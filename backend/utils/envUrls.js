/**
 * Normalize env URLs for Chapa (requires absolute https URLs in production).
 */

/** Stable production frontend — also listed in index.js CORS allowlist */
const DEFAULT_PRODUCTION_FRONTEND = 'https://book-nest-frontend-v2-main.vercel.app';

const PLACEHOLDER_HOST_PATTERNS = [
  /^your-vercel-frontend-url/i,
  /^your-app/i,
  /^your-vercel/i,
  /^your-api/i,
  /^example\.com$/i,
];

const PREVIEW_HOST_PATTERNS = [/-git-/i, /_[a-z0-9]{6,}\.vercel\.app$/i];

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

function getHostname(baseUrl) {
  return new URL(baseUrl).hostname.toLowerCase();
}

function assertNotPlaceholderHost(baseUrl, envName) {
  const host = getHostname(baseUrl);
  const isPlaceholder = PLACEHOLDER_HOST_PATTERNS.some((re) => re.test(host));

  if (!isPlaceholder) return;

  const message =
    `${envName} is set to a documentation placeholder ("${host}"). ` +
    'Use your real production URL. For BookNest production set FRONTEND_URL=https://book-nest-frontend-v2-main.vercel.app on Railway.';

  if (process.env.NODE_ENV === 'production') {
    throw new Error(message);
  }

  console.warn(`⚠️ ${message}`);
}

function warnIfPreviewHost(baseUrl, envName) {
  const host = getHostname(baseUrl);
  const isPreview = PREVIEW_HOST_PATTERNS.some((re) => re.test(host));

  if (!isPreview) return;

  const message =
    `${envName} looks like a Vercel preview deployment ("${host}"). ` +
    'Prefer your stable production URL for Chapa return_url to avoid DEPLOYMENT_NOT_FOUND.';

  console.warn(`⚠️ ${message}`);
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

  if (url) {
    assertNotPlaceholderHost(url, 'BACKEND_URL');
    return url;
  }

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
  const url = pickFirstUrl([
    process.env.FRONTEND_URL,
    process.env.NODE_ENV === 'production' ? DEFAULT_PRODUCTION_FRONTEND : null,
  ]);

  if (url) {
    assertNotPlaceholderHost(url, 'FRONTEND_URL');
    warnIfPreviewHost(url, 'FRONTEND_URL');
    return url;
  }

  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:3000';
  }

  throw new Error(
    `FRONTEND_URL is missing or invalid. Set it to ${DEFAULT_PRODUCTION_FRONTEND} (no trailing slash)`
  );
}

export function logResolvedUrls(logger) {
  try {
    const backend = getBackendUrl();
    const frontend = getFrontendUrl();

    logger.info('Resolved public URLs', {
      backend,
      frontend,
      chapa_callback: `${backend}/api/webhooks/chapa`,
      chapa_return: `${frontend}/checkout/result`,
      auth_verify_redirect: `${frontend}/auth/verify`,
      auth_reset_redirect: `${frontend}/reset-password`,
      supabase_hint:
        'Add auth_verify_redirect + auth_reset_redirect (+ /verify, /auth/callback) under Supabase → Authentication → URL Configuration → Redirect URLs',
    });
  } catch (err) {
    logger.error('URL configuration error — server will start but payments/email links may fail', {
      message: err.message,
    });
  }
}
