import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

export const analyticsRepository = {
  async getSalesSummary(userId) {
    try {
      const { data: books, error: booksError } = await supabaseAdmin
        .from('books')
        .select('id, title, cover_image_url, sales_count, total_revenue')
        .eq('uploaded_by', userId)
        .eq('is_active', true);

      if (booksError) {
        logger.error('Analytics books error', { error: booksError.message });
        throw booksError;
      }

      const bookIds = (books || []).map((b) => b.id);

      const { count: pendingCount } = await supabaseAdmin
        .from('books')
        .select('id', { count: 'exact', head: true })
        .eq('uploaded_by', userId)
        .eq('status', 'pending_review');

      const totalBooks = books?.length || 0;
      const totalCopiesSold = books?.reduce((sum, b) => sum + (b.sales_count || 0), 0) || 0;
      const totalRevenue = books?.reduce((sum, b) => sum + parseFloat(b.total_revenue || 0), 0) || 0;

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      let salesOverTime = [];
      if (bookIds.length) {
        const { data: formats } = await supabaseAdmin
          .from('book_formats')
          .select('id, book_id')
          .in('book_id', bookIds);

        const formatIds = (formats || []).map((f) => f.id);

        if (formatIds.length) {
          const { data: items } = await supabaseAdmin
            .from('transaction_items')
            .select(
              `
              amount, created_at,
              transaction:transactions!inner(status, created_at)
            `
            )
            .in('book_format_id', formatIds)
            .gte('created_at', thirtyDaysAgo.toISOString());

          const byDay = {};
          for (const item of items || []) {
            if (item.transaction?.status !== 'completed') continue;
            const day = (item.created_at || item.transaction.created_at).slice(0, 10);
            if (!byDay[day]) byDay[day] = { date: day, sales: 0, revenue: 0 };
            byDay[day].sales += 1;
            byDay[day].revenue += parseFloat(item.amount) || 0;
          }
          salesOverTime = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));
        }
      }

      const topBooks =
        books
          ?.filter((b) => (b.sales_count || 0) > 0)
          .sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))
          .slice(0, 5)
          .map((b) => ({
            book_id: b.id,
            title: b.title,
            cover_image_url: b.cover_image_url,
            copies_sold: b.sales_count || 0,
            revenue: parseFloat(b.total_revenue || 0),
          })) || [];

      const { data: wallet } = await supabaseAdmin
        .from('seller_wallets')
        .select('available_balance, pending_balance, currency')
        .eq('user_id', userId)
        .maybeSingle();

      return {
        total_books: totalBooks,
        total_copies_sold: totalCopiesSold,
        total_revenue: totalRevenue,
        pending_approval: pendingCount || 0,
        sales_over_time: salesOverTime,
        top_books: topBooks,
        wallet: wallet || { available_balance: 0, pending_balance: 0, currency: 'ETB' },
        error: null,
      };
    } catch (error) {
      logger.error('Analytics unexpected error', { error: error.message });
      throw error;
    }
  },

  async getSalesReport(userId, fromDate, toDate) {
    const { data: books } = await supabaseAdmin
      .from('books')
      .select('id, title')
      .eq('uploaded_by', userId);

    const bookIds = (books || []).map((b) => b.id);
    if (!bookIds.length) return { rows: [], total_revenue: 0, total_sales: 0 };

    const { data: formats } = await supabaseAdmin
      .from('book_formats')
      .select('id, book_id, format_type')
      .in('book_id', bookIds);

    const formatIds = (formats || []).map((f) => f.id);
    if (!formatIds.length) return { rows: [], total_revenue: 0, total_sales: 0 };

    let query = supabaseAdmin
      .from('transaction_items')
      .select(
        `
        amount, created_at, book_format_id,
        transaction:transactions!inner(status, transaction_number, created_at)
      `
      )
      .in('book_format_id', formatIds)
      .eq('transaction.status', 'completed');

    if (fromDate) query = query.gte('created_at', fromDate);
    if (toDate) query = query.lte('created_at', toDate);

    const { data: items, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;

    const bookById = Object.fromEntries((books || []).map((b) => [b.id, b.title]));
    const formatMeta = Object.fromEntries(
      (formats || []).map((f) => [f.id, { book_id: f.book_id, format_type: f.format_type }])
    );

    const rows = (items || []).map((item) => {
      const meta = formatMeta[item.book_format_id];
      return {
        date: item.created_at,
        transaction_number: item.transaction?.transaction_number,
        book_title: meta ? bookById[meta.book_id] : 'Unknown',
        format_type: meta?.format_type,
        amount: parseFloat(item.amount) || 0,
      };
    });

    const total_revenue = rows.reduce((s, r) => s + r.amount, 0);
    return { rows, total_revenue, total_sales: rows.length };
  },
};
