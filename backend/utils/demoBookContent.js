/**
 * Demo PDF/audio for admin content preview (Amharic / Oromo samples).
 * Set ADMIN_USE_DEMO_CONTENT=false to stream real database uploads instead.
 */

/** Set ADMIN_USE_DEMO_CONTENT=true to force demo PDF only. Audio always uses DB upload first. */
export function adminUseDemoContent(formatKind) {
  if (formatKind === 'audio' || formatKind === 'Audio') return false;
  return process.env.ADMIN_USE_DEMO_CONTENT === 'true';
}

export const DEFAULT_DEMO_PDF_URLS = [
  process.env.DEMO_AMHARIC_PDF_URL,
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
  'https://pdfobject.com/pdf/sample.pdf',
].filter(Boolean);

export const DEFAULT_DEMO_AUDIO_URLS = [
  process.env.DEMO_AMHARIC_AUDIO_URL,
  'https://samplelib.com/lib/preview/mp3/sample-3s.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
].filter(Boolean);

export const DEMO_BY_LANGUAGE = {
  Amharic: {
    pdf: {
      url: DEFAULT_DEMO_PDF_URLS[0],
      fallbackUrls: DEFAULT_DEMO_PDF_URLS.slice(1),
      fileName: 'amharic-demo-manuscript.pdf',
      pageCount: 3,
      mimeType: 'application/pdf',
      label: 'አማርኛ ዳሞ — የናሙና PDF',
    },
    audio: {
      url: DEFAULT_DEMO_AUDIO_URLS[0],
      fallbackUrls: DEFAULT_DEMO_AUDIO_URLS.slice(1),
      fileName: 'amharic-demo-audio.mp3',
      durationSec: 372,
      fileSizeBytes: 5_500_000,
      mimeType: 'audio/mpeg',
      label: 'አማርኛ ዳሞ — የሙዚቃ ንባብ',
    },
  },
  Oromo: {
    pdf: {
      url:
        process.env.DEMO_OROMO_PDF_URL ||
        DEFAULT_DEMO_PDF_URLS[0],
      fallbackUrls: [
        process.env.DEMO_OROMO_PDF_URL,
        ...DEFAULT_DEMO_PDF_URLS,
      ].filter(Boolean),
      fileName: 'oromo-demo-manuscript.pdf',
      pageCount: 3,
      mimeType: 'application/pdf',
      label: 'Oromo demo — sample PDF',
    },
    audio: {
      url:
        process.env.DEMO_OROMO_AUDIO_URL ||
        DEFAULT_DEMO_AUDIO_URLS[0],
      fallbackUrls: [
        process.env.DEMO_OROMO_AUDIO_URL,
        ...DEFAULT_DEMO_AUDIO_URLS,
      ].filter(Boolean),
      fileName: 'oromo-demo-audio.mp3',
      durationSec: 372,
      fileSizeBytes: 5_500_000,
      mimeType: 'audio/mpeg',
      label: 'Oromo demo — sample audio',
    },
  },
};

export function pickDemoLanguage(bookLanguage) {
  const lang = String(bookLanguage || '').toLowerCase();
  if (lang.includes('oromo') || lang.includes('afaan')) return 'Oromo';
  if (lang.includes('amharic') || lang.includes('አማር') || lang.includes('amh')) {
    return 'Amharic';
  }
  return 'Amharic';
}

export function getDemoFormat(formatType, bookLanguage) {
  const key = pickDemoLanguage(bookLanguage);
  const pack = DEMO_BY_LANGUAGE[key] || DEMO_BY_LANGUAGE.Amharic;
  return formatType === 'Audio' || formatType === 'audio' ? pack.audio : pack.pdf;
}

export function hasUploadedContent(format) {
  if (!format) return false;
  return Boolean(
    format.fileUrl ||
      format.storagePath ||
      format.file_url ||
      format.storage_path,
  );
}

/** Prefer database upload; demo fallback when missing (audio always follows this). */
export function attachPlaybackMeta(format, bookLanguage) {
  if (!format) return format;

  const formatType = format.formatType || format.format_type;
  const uploaded = hasUploadedContent(format);
  const forceDemo = adminUseDemoContent(formatType);

  if (uploaded && !forceDemo) {
    return {
      ...format,
      playbackUrl: format.fileUrl || format.file_url,
      isDemoContent: false,
      hasContent: Boolean(format.fileUrl || format.file_url || format.storagePath),
      missing: false,
    };
  }

  if (forceDemo || !uploaded) {
    const demo = getDemoFormat(formatType, bookLanguage);
    return {
      ...format,
      formatType,
      fileUrl: demo.url,
      playbackUrl: demo.url,
      fileName: demo.fileName,
      pageCount: demo.pageCount ?? format.pageCount ?? null,
      durationSec: demo.durationSec ?? format.durationSec ?? null,
      fileSizeBytes: demo.fileSizeBytes ?? format.fileSizeBytes ?? null,
      mimeType: demo.mimeType,
      isDemoContent: !uploaded || forceDemo,
      demoLabel: demo.label,
      hasContent: true,
      missing: false,
    };
  }

  return format;
}
