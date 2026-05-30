import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { computeSellerSales } from '../services/bookSalesService.js';

function buildLast30DaysSeries(byDay) {
  const series = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    const row = byDay[date];
    series.push({
      date,
      sales: row?.sales || 0,
      revenue: row?.revenue || 0,
    });
  }
  return series;
}

export const analyticsRepository = {
  async getSalesSummary(userId) {
    try {
      const { byBook, totalCopies, totalRevenue, books } = await computeSellerSales(userId);

      const { count: pendingCount } = await supabaseAdmin
        .from('books')
        .select('id', { count: 'exact', head: true })
        .eq('uploaded_by', userId)
        .eq('status', 'pending_review');

      const bookIds = (books || []).map((b) => b.id);
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
          salesOverTime = buildLast30DaysSeries(byDay);
        } else {
          salesOverTime = buildLast30DaysSeries({});
        }
      } else {
        salesOverTime = buildLast30DaysSeries({});
      }

      const topBooks = (books || [])
        .map((b) => ({
          book_id: b.id,
          title: b.title,
          cover_image_url: b.cover_image_url,
          copies_sold: byBook[b.id]?.copies || 0,
          revenue: byBook[b.id]?.revenue || 0,
        }))
        .filter((b) => b.copies_sold > 0)
        .sort((a, b) => b.copies_sold - a.copies_sold)
        .slice(0, 5);

      const { data: wallet } = await supabaseAdmin
        .from('seller_wallets')
        .select('available_balance, pending_balance, currency')
        .eq('user_id', userId)
        .maybeSingle();

      return {
        total_books: books?.length || 0,
        total_copies_sold: totalCopies,
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

  async getBookPerformance(userId) {
    const { byBook, books } = await computeSellerSales(userId);

    const bookIds = (books || []).map((b) => b.id);
    const wishlistCounts = {};

    if (bookIds.length) {
      const { data: wishlistRows } = await supabaseAdmin
        .from('wishlist')
        .select('book_id')
        .in('book_id', bookIds);

      for (const row of wishlistRows || []) {
        wishlistCounts[row.book_id] = (wishlistCounts[row.book_id] || 0) + 1;
      }
    }

    const totalCopies = Object.values(byBook).reduce((sum, b) => sum + b.copies, 0) || 1;

    return (books || []).map((book) => {
      const computed = byBook[book.id] || { copies: 0, revenue: 0 };
      const copies = computed.copies;
      const revenue = computed.revenue;
      const wishlistCount = wishlistCounts[book.id] || 0;
      const rating = parseFloat(book.avg_rating || 0);
      const reviewCount = book.review_count || 0;

      const salesShare = totalCopies > 0 ? Math.round((copies / totalCopies) * 100) : 0;
      const marketScore = Math.min(
        100,
        Math.round(wishlistCount * 3 + reviewCount * 8 + copies * 5 + rating * 12)
      );

      return {
        book_id: book.id,
        title: book.title,
        cover_image_url: book.cover_image_url,
        status: book.status,
        copies_sold: copies,
        revenue,
        avg_rating: rating,
        review_count: reviewCount,
        wishlist_count: wishlistCount,
        sales_share_percent: salesShare,
        engagement_score: marketScore,
        market_score: marketScore,
        created_at: book.created_at,
      };
    });
  },
};
