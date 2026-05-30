import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

/**
 * Increment book sales counters on the books row (source for catalog analytics).
 */
export async function incrementBookSale(bookId, saleAmount = 0) {
  if (!bookId) return;

  const revenue = parseFloat(saleAmount) || 0;

  const { error: rpcError } = await supabaseAdmin.rpc('increment_book_sales', {
    book_id: bookId,
    amount: 1,
    revenue,
  });

  if (!rpcError) return;

  logger.warn('increment_book_sales RPC failed, using direct update', {
    bookId,
    error: rpcError.message,
  });

  const { data: book } = await supabaseAdmin
    .from('books')
    .select('sales_count, total_revenue')
    .eq('id', bookId)
    .maybeSingle();

  if (!book) return;

  const { error: updateError } = await supabaseAdmin
    .from('books')
    .update({
      sales_count: (book.sales_count || 0) + 1,
      total_revenue: parseFloat(book.total_revenue || 0) + revenue,
    })
    .eq('id', bookId);

  if (updateError) {
    logger.error('Direct book sales update failed', { bookId, error: updateError.message });
  }
}

/**
 * Aggregate completed sales from transaction_items (source of truth for analytics).
 */
export async function computeSellerSales(userId) {
  const { data: books } = await supabaseAdmin
    .from('books')
    .select('id, title, cover_image_url, status, created_at, avg_rating, review_count')
    .eq('uploaded_by', userId);

  const bookList = books || [];
  const bookIds = bookList.map((b) => b.id);

  if (!bookIds.length) {
    return {
      byBook: {},
      totalCopies: 0,
      totalRevenue: 0,
      books: bookList,
    };
  }

  const { data: formats } = await supabaseAdmin
    .from('book_formats')
    .select('id, book_id')
    .in('book_id', bookIds);

  const formatToBook = Object.fromEntries((formats || []).map((f) => [f.id, f.book_id]));
  const formatIds = (formats || []).map((f) => f.id);

  if (!formatIds.length) {
    return { byBook: {}, totalCopies: 0, totalRevenue: 0, books: bookList };
  }

  const { data: items, error } = await supabaseAdmin
    .from('transaction_items')
    .select(
      `
      book_format_id,
      amount,
      transaction:transactions!inner(status)
    `
    )
    .in('book_format_id', formatIds);

  if (error) {
    logger.error('computeSellerSales failed', { userId, error: error.message });
    throw error;
  }

  const byBook = {};
  let totalCopies = 0;
  let totalRevenue = 0;

  for (const item of items || []) {
    if (item.transaction?.status !== 'completed') continue;
    const bookId = formatToBook[item.book_format_id];
    if (!bookId) continue;

    if (!byBook[bookId]) {
      byBook[bookId] = { copies: 0, revenue: 0 };
    }
    byBook[bookId].copies += 1;
    byBook[bookId].revenue += parseFloat(item.amount) || 0;
    totalCopies += 1;
    totalRevenue += parseFloat(item.amount) || 0;
  }

  return { byBook, totalCopies, totalRevenue, books: bookList };
}
