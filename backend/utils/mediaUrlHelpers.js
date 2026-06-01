/** Helpers for Google Drive and other external media URLs. */

export function extractGoogleDriveId(url) {
  if (!url || typeof url !== 'string') return null;
  const fileMatch = url.match(/\/file\/d\/([^/]+)/);
  if (fileMatch) return fileMatch[1];
  const openMatch = url.match(/[?&]id=([^&]+)/);
  if (openMatch) return openMatch[1];
  return null;
}

export function isGoogleDriveUrl(url) {
  if (!url) return false;
  return /google\.com|googleusercontent\.com|gstatic\.com/i.test(url);
}

export function googleDrivePreviewUrl(url) {
  const id = extractGoogleDriveId(url);
  if (!id) return null;
  return `https://drive.google.com/file/d/${id}/preview`;
}

export function googleDriveDownloadUrl(url) {
  const id = extractGoogleDriveId(url);
  if (!id) return url;
  return `https://drive.google.com/uc?export=download&id=${id}`;
}

export function googleDocsPdfViewerUrl(url) {
  if (!url) return null;
  return `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;
}

export function contentTypeForFormat(formatKind, mimeType, fileName) {
  if (mimeType) return mimeType;
  const name = (fileName || '').toLowerCase();
  if (formatKind === 'audio') {
    if (name.endsWith('.wav')) return 'audio/wav';
    if (name.endsWith('.ogg')) return 'audio/ogg';
    if (name.endsWith('.m4a')) return 'audio/mp4';
    return 'audio/mpeg';
  }
  return 'application/pdf';
}

const DEFAULT_FETCH_TIMEOUT_MS = 20_000;

/** Fetch with timeout; throws on non-OK status or abort. */
export async function fetchBuffer(url, { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Remote fetch failed (${res.status})`);
    }
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}
