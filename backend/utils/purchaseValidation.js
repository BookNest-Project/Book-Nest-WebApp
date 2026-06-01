import { supabaseAdmin } from '../config/supabase.js';

export async function userOwnsAnyFormatOfBook(userId, bookId) {
  if (!userId || !bookId) return false;

  const { data: formats, error: formatsError } = await supabaseAdmin
    .from('book_formats')
    .select('id')
    .eq('book_id', bookId);

  if (formatsError || !formats?.length) return false;

  const formatIds = formats.map((f) => f.id);
  const owned = await getOwnedFormatIds(userId, formatIds);
  return owned.size > 0;
}

export async function getOwnedFormatIds(userId, formatIds) {
  if (!formatIds.length) return new Set();

  const { data, error } = await supabaseAdmin
    .from('user_purchases')
    .select('book_format_id')
    .eq('user_id', userId)
    .in('book_format_id', formatIds);

  if (error) throw error;
  return new Set((data || []).map((row) => row.book_format_id));
}

export async function getBookFormatForPurchase(bookFormatId) {
  const { data: bookFormat, error } = await supabaseAdmin
    .from('book_formats')
    .select(`
      id,
      price,
      currency,
      is_active,
      format_type,
      book:books!inner (
        id,
        title,
        author_name,
        cover_image_url,
        status,
        uploaded_by,
        author_user_id
      )
    `)
    .eq('id', bookFormatId)
    .single();

  if (error || !bookFormat) {
    return { bookFormat: null, error: 'Book format not found' };
  }

  if (bookFormat.book?.status !== 'approved' || bookFormat.is_active === false) {
    return { bookFormat: null, error: 'This format is not available for purchase' };
  }

  return { bookFormat, error: null };
}

export function isOwnBook(userId, book) {
  if (!userId || !book) return false;
  return book.uploaded_by === userId || book.author_user_id === userId;
}

export async function assertCanPurchaseFormats(userId, formatIds) {
  const uniqueIds = [...new Set(formatIds.filter(Boolean))];

  for (const formatId of uniqueIds) {
    const { bookFormat, error } = await getBookFormatForPurchase(formatId);
    if (error) {
      const err = new Error(error);
      err.statusCode = 404;
      throw err;
    }

    if (isOwnBook(userId, bookFormat.book)) {
      const err = new Error('You cannot purchase your own book');
      err.statusCode = 403;
      throw err;
    }
  }

  const owned = await getOwnedFormatIds(userId, uniqueIds);
  if (owned.size > 0) {
    const err = new Error('You already own one or more selected formats');
    err.statusCode = 409;
    throw err;
  }

  return uniqueIds;
}
