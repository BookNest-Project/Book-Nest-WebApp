/** Fields compared for admin metadata update review */
export const SNAPSHOT_FIELDS = [
  { key: 'title', label: 'Title' },
  { key: 'subtitle', label: 'Subtitle' },
  { key: 'description', label: 'Description' },
  { key: 'isbn', label: 'ISBN' },
  { key: 'author_name', label: 'Author name' },
  { key: 'publisher_name', label: 'Publisher' },
  { key: 'language', label: 'Language' },
  { key: 'genre_name', label: 'Category' },
  { key: 'cover_image_url', label: 'Cover image' },
  { key: 'publication_date', label: 'Publication date' },
  { key: 'pdf_price', label: 'PDF price' },
  { key: 'audio_price', label: 'Audio price' },
  { key: 'bundle_price', label: 'Bundle price' },
  { key: 'currency', label: 'Currency' },
];

export function pricingFromFormats(formats = []) {
  const pdf = formats.find((f) => f.format_type === 'PDF' || f.formatType === 'PDF');
  const audio = formats.find((f) => f.format_type === 'Audio' || f.formatType === 'Audio');
  const pdfPrice = pdf ? Number(pdf.price) : null;
  const audioPrice = audio ? Number(audio.price) : null;
  const currency = pdf?.currency || audio?.currency || 'ETB';
  const bundlePrice =
    pdfPrice != null && audioPrice != null ? Number((pdfPrice + audioPrice).toFixed(2)) : null;
  return { pdfPrice, audioPrice, bundlePrice, currency };
}

export function buildBookSnapshot(book, genreName = null, formats = []) {
  const { pdfPrice, audioPrice, bundlePrice, currency } = pricingFromFormats(formats);
  return {
    title: book.title ?? null,
    subtitle: book.subtitle ?? null,
    description: book.description ?? null,
    isbn: book.isbn ?? null,
    author_name: book.author_name ?? null,
    publisher_name: book.publisher_name ?? null,
    language: book.language ?? null,
    genre_id: book.genre_id ?? null,
    genre_name: genreName ?? null,
    cover_image_url: book.cover_image_url ?? null,
    publication_date: book.publication_date ?? null,
    pdf_price: pdfPrice,
    audio_price: audioPrice,
    bundle_price: bundlePrice,
    currency,
  };
}

export function formatsToSnapshot(formats = []) {
  return formats.map((f) => ({
    id: f.id,
    format_type: f.format_type || f.formatType,
    price: Number(f.price),
    currency: f.currency,
    file_url: f.file_url || f.fileUrl,
    storage_path: f.storage_path || f.storagePath,
    file_size_bytes: f.file_size_bytes ?? f.fileSizeBytes,
    page_count: f.page_count ?? f.pageCount,
    duration_sec: f.duration_sec ?? f.durationSec,
    created_at: f.created_at || f.uploadedAt,
  }));
}

export function computeFieldChanges(previous, proposed) {
  if (!previous || !proposed) return [];

  const changes = [];

  for (const { key, label } of SNAPSHOT_FIELDS) {
    const prevVal = previous[key] ?? null;
    const nextVal = proposed[key] ?? null;
    const prevStr = prevVal === null || prevVal === undefined ? '' : String(prevVal).trim();
    const nextStr = nextVal === null || nextVal === undefined ? '' : String(nextVal).trim();

    if (prevStr !== nextStr) {
      changes.push({
        field: key,
        label,
        previous: prevStr || null,
        proposed: nextStr || null,
      });
    }
  }

  return changes;
}
