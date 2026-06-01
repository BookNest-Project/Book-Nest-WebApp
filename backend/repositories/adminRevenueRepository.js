import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

const SUCCESS_STATUSES = ['completed', 'success', 'paid'];

const BOOK_SALES_SELECT = `
  id,
  book_id,
  book_format_id,
  format_type,
  buyer_id,
  seller_id,
  sale_price,
  platform_commission,
  seller_earnings,
  commission_rate,
  payment_id,
  quantity,
  sale_date,
  payments (
    id,
    tx_ref,
    status,
    payment_method,
    amount,
    created_at
  ),
  books (
    id,
    title,
    isbn,
    cover_image_url,
    language,
    author_name,
    author_user_id,
    publisher_name,
    publisher_user_id,
    genre_id,
    genres ( id, name )
  ),
  book_formats (
    id,
    format_type,
    price
  )
`;

const PURCHASE_SELECT = `
  id,
  user_id,
  book_format_id,
  transaction_id,
  purchased_at,
  transactions!inner (
    id,
    transaction_number,
    amount,
    currency,
    payment_method,
    status,
    completed_at,
    created_at
  ),
  book_formats (
    id,
    format_type,
    price,
    books (
      id,
      title,
      isbn,
      cover_image_url,
      language,
      author_name,
      author_user_id,
      publisher_name,
      publisher_user_id,
      genre_id,
      genres ( id, name )
    )
  )
`;

function tableMissing(error, tables = []) {
  const msg = error?.message || '';
  return (
    tables.some((t) => msg.includes(t)) ||
    msg.includes('schema cache') ||
    msg.includes('PGRST205')
  );
}

function normalizePurchaseRow(row, commissionPercent) {
  const tx = row.transactions || {};
  const bf = row.book_formats || {};
  const book = bf.books || {};
  const amount = Number(tx.amount) || Number(bf.price) || 0;
  const rate = commissionPercent;
  const commission = Math.round(amount * (rate / 100) * 100) / 100;
  const authorEarn = Math.round((amount - commission) * 100) / 100;
  const saleDate = row.purchased_at || tx.completed_at || tx.created_at;

  return {
    _source: 'user_purchases',
    id: row.id,
    book_id: book.id,
    book_format_id: row.book_format_id,
    format_type: bf.format_type,
    buyer_id: row.user_id,
    seller_id: book.author_user_id || book.publisher_user_id,
    sale_price: amount,
    platform_commission: commission,
    seller_earnings: authorEarn,
    commission_rate: rate,
    quantity: 1,
    sale_date: saleDate,
    payments: {
      id: tx.id,
      tx_ref: tx.transaction_number,
      status: tx.status,
      payment_method: tx.payment_method || 'chapa',
      amount: tx.amount,
      created_at: tx.created_at,
    },
    books: book,
    book_formats: bf,
  };
}

export const adminRevenueRepository = {
  dataSource: null,

  async listFromPurchases({ from, to, page = 1, limit = 50, commissionPercent = 20 } = {}) {
    const offset = (Math.max(1, page) - 1) * limit;
    let query = supabaseAdmin
      .from('user_purchases')
      .select(PURCHASE_SELECT, { count: 'exact' })
      .in('transactions.status', SUCCESS_STATUSES)
      .order('purchased_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (from) query = query.gte('purchased_at', from);
    if (to) query = query.lte('purchased_at', to);

    const { data, error, count } = await query;
    if (error) {
      if (tableMissing(error, ['user_purchases', 'transactions'])) {
        return { rows: [], total: 0, tableReady: false, source: null };
      }
      throw error;
    }

    const rows = (data || []).map((r) => normalizePurchaseRow(r, commissionPercent));
    return { rows, total: count ?? rows.length, tableReady: true, source: 'user_purchases' };
  },

  async listFromBookSales({ from, to, page = 1, limit = 50 } = {}) {
    const offset = (Math.max(1, page) - 1) * limit;
    let query = supabaseAdmin
      .from('book_sales')
      .select(BOOK_SALES_SELECT, { count: 'exact' })
      .order('sale_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (from) query = query.gte('sale_date', from);
    if (to) query = query.lte('sale_date', to);

    const { data, error, count } = await query;
    if (error) {
      if (tableMissing(error, ['book_sales'])) {
        return { rows: [], total: 0, tableReady: false, source: null };
      }
      throw error;
    }

    const rows = (data || []).filter((r) => {
      const st = r.payments?.status;
      return !st || SUCCESS_STATUSES.includes(st) || st === 'success';
    });
    return { rows, total: count ?? rows.length, tableReady: true, source: 'book_sales' };
  },

  async listSuccessfulSales(opts = {}) {
    const { commissionPercent = 20 } = opts;

    const purchases = await this.listFromPurchases({ ...opts, commissionPercent });
    if (purchases.tableReady) {
      this.dataSource = 'user_purchases';
      return purchases;
    }

    const sales = await this.listFromBookSales(opts);
    if (sales.tableReady) {
      this.dataSource = 'book_sales';
      return sales;
    }

    logger.warn('adminRevenueRepository: no sales tables available');
    return { rows: [], total: 0, tableReady: false, source: null };
  },

  async fetchAllSuccessfulSalesInRange(opts = {}) {
    const pageSize = 500;
    let page = 1;
    const all = [];
    let source = null;
    let tableReady = false;

    while (true) {
      const batch = await this.listSuccessfulSales({
        ...opts,
        page,
        limit: pageSize,
      });
      tableReady = batch.tableReady;
      source = batch.source;
      if (!tableReady) return { rows: [], tableReady: false, source: null };
      all.push(...batch.rows);
      if (batch.rows.length < pageSize) break;
      page += 1;
      if (page > 200) break;
    }
    return { rows: all, tableReady: true, source };
  },
};
