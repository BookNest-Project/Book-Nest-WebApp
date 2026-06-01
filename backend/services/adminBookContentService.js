import { Readable } from 'node:stream';
import { NotFoundError } from '../utils/errors.js';
import { adminApprovalRepository } from '../repositories/adminApprovalRepository.js';
import { mapFormatRow } from '../repositories/bookReviewWorkflowRepository.js';
import { supabaseAdmin } from '../config/supabase.js';
import {
  contentTypeForFormat,
  fetchBuffer,
  googleDriveDownloadUrl,
  isGoogleDriveUrl,
} from '../utils/mediaUrlHelpers.js';
import { resolveFormatFileUrl } from '../utils/formatFileUrl.js';
import {
  attachPlaybackMeta,
  adminUseDemoContent,
  getDemoFormat,
  hasUploadedContent,
} from '../utils/demoBookContent.js';

const BUCKET = 'booknest';
const STORAGE_FETCH_TIMEOUT_MS = 12_000;
const REMOTE_FETCH_TIMEOUT_MS = 60_000;

async function remoteStreamFromUrl(url, rangeHeader) {
  const fetchUrl = isGoogleDriveUrl(url) ? googleDriveDownloadUrl(url) : url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS);
  try {
    const headers = {};
    if (rangeHeader) headers.Range = rangeHeader;

    const res = await fetch(fetchUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers,
    });
    if (!res.ok && res.status !== 206) {
      throw new Error(`Remote fetch failed (${res.status})`);
    }
    if (!res.body) {
      throw new Error('Remote fetch returned no body');
    }
    return {
      stream: Readable.fromWeb(res.body),
      contentType: res.headers.get('content-type'),
      contentLength: res.headers.get('content-length'),
      contentRange: res.headers.get('content-range'),
      acceptRanges: res.headers.get('accept-ranges'),
      statusCode: res.status,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function bufferFromStoragePath(storagePath) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STORAGE_FETCH_TIMEOUT_MS);
  try {
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(storagePath);
    if (!error && data && data.size > 0) {
      return Buffer.from(await data.arrayBuffer());
    }
  } catch {
    /* try signed URL next */
  } finally {
    clearTimeout(timer);
  }

  try {
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600);

    if (!signErr && signed?.signedUrl) {
      return await fetchBuffer(signed.signedUrl, { timeoutMs: REMOTE_FETCH_TIMEOUT_MS });
    }
  } catch {
    /* fall through */
  }

  return null;
}

async function bufferFromRemoteUrl(url) {
  const fetchUrl = isGoogleDriveUrl(url) ? googleDriveDownloadUrl(url) : url;
  return fetchBuffer(fetchUrl, { timeoutMs: REMOTE_FETCH_TIMEOUT_MS });
}

async function tryLoadUploadedFormat(row, formatKind) {
  const format = mapFormatRow(row);
  const fileUrl = format.fileUrl || resolveFormatFileUrl(row);

  if (!hasUploadedContent({ ...format, fileUrl })) {
    return null;
  }

  let buffer = null;

  // Prefer direct HTTP URLs first — stream without buffering large audio files.
  if (fileUrl) {
    try {
      const remote = await remoteStreamFromUrl(fileUrl);
      return {
        stream: remote.stream,
        contentType: contentTypeForFormat(
          formatKind,
          remote.contentType,
          format.fileName,
        ),
        contentLength: remote.contentLength,
        fileName: format.fileName || (formatKind === 'audio' ? 'audio.mp3' : 'book.pdf'),
        sourceUrl: fileUrl,
        isGoogleDrive: isGoogleDriveUrl(fileUrl),
        isDemo: false,
        source: 'uploaded',
      };
    } catch {
      /* try storage next */
    }
  }

  if (!buffer && format.storagePath) {
    buffer = await bufferFromStoragePath(format.storagePath);
  }

  if (!buffer || buffer.length === 0) return null;

  return {
    buffer,
    contentType: contentTypeForFormat(formatKind, format.mimeType, format.fileName),
    fileName: format.fileName || (formatKind === 'audio' ? 'audio.mp3' : 'book.pdf'),
    sourceUrl: fileUrl,
    isGoogleDrive: isGoogleDriveUrl(fileUrl),
    isDemo: false,
    source: 'uploaded',
  };
}

async function loadDemoFormat(bookLanguage, formatKind) {
  const formatType = formatKind === 'audio' ? 'Audio' : 'PDF';
  const demo = getDemoFormat(formatType, bookLanguage);
  const urls = [demo.url, ...(demo.fallbackUrls || [])].filter(Boolean);
  const uniqueUrls = [...new Set(urls)];

  let lastError = null;
  for (const url of uniqueUrls) {
    try {
      const remote = await remoteStreamFromUrl(url);
      return {
        stream: remote.stream,
        contentType: contentTypeForFormat(formatKind, demo.mimeType, demo.fileName),
        contentLength: remote.contentLength,
        fileName: demo.fileName,
        sourceUrl: url,
        isGoogleDrive: false,
        isDemo: true,
        source: 'demo',
        demoLabel: demo.label,
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error(`Could not load demo ${formatType}`);
}

export const adminBookContentService = {
  attachPlaybackMeta,
  getDemoFormat,

  fetchRemoteRange(sourceUrl, rangeHeader) {
    return remoteStreamFromUrl(sourceUrl, rangeHeader);
  },

  /** Apply demo fallback on format list for API responses. */
  enrichFormatsForPlayback(formats, bookLanguage) {
    return (formats || []).map((f) => {
      const mapped = f.formatType ? f : mapFormatRow(f);
      return attachPlaybackMeta(mapped, bookLanguage);
    });
  },

  buildFormatSlotsWithPlayback(formats, bookLanguage) {
    const enriched = this.enrichFormatsForPlayback(formats, bookLanguage);
    const pdf = enriched.find((f) => f.formatType === 'PDF');
    const audio = enriched.find((f) => f.formatType === 'Audio');
    const empty = (formatType) =>
      attachPlaybackMeta(
        {
          id: null,
          formatType,
          price: null,
          currency: 'ETB',
          fileUrl: null,
          missing: true,
        },
        bookLanguage,
      );
    return {
      pdf: pdf || empty('PDF'),
      audio: audio || empty('Audio'),
    };
  },

  async getFormatStream(bookId, formatKind) {
    const formatType = formatKind === 'audio' ? 'Audio' : 'PDF';
    const book = await adminApprovalRepository.findBookById(bookId);
    if (!book) throw new NotFoundError('Book');

    if (adminUseDemoContent(formatKind)) {
      try {
        return await loadDemoFormat(book.language, formatKind);
      } catch {
        throw new NotFoundError(`Could not load demo ${formatType}`);
      }
    }

    const formatsRaw = await adminApprovalRepository.findFormatsByBookId(bookId);
    const row = formatsRaw.find((f) => (f.format_type || f.formatType) === formatType);

    if (row) {
      const uploaded = await tryLoadUploadedFormat(row, formatKind);
      if (uploaded) return uploaded;
    }

    try {
      return await loadDemoFormat(book.language, formatKind);
    } catch {
      throw new NotFoundError(`Could not load ${formatType}`);
    }
  },
};
