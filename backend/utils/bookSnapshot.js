/** Fields compared for admin metadata update review */
export const SNAPSHOT_FIELDS = [
  { key: 'title', label: 'Title' },
  { key: 'subtitle', label: 'Subtitle' },
  { key: 'description', label: 'Abstract' },
  { key: 'isbn', label: 'ISBN' },
  { key: 'author_name', label: 'Author name' },
  { key: 'publisher_name', label: 'Publisher' },
  { key: 'language', label: 'Language' },
  { key: 'genre_name', label: 'Categories' },
  { key: 'cover_image_url', label: 'Cover image' },
  { key: 'publication_date', label: 'Publication date' },
];

export function buildBookSnapshot(book, genreName = null) {
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
  };
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
