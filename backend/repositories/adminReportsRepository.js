import { supabaseAdmin } from '../config/supabase.js';

export const adminReportsRepository = {
  async countUsersActiveSince(sinceIso) {
    const { count, error } = await supabaseAdmin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .gte('updated_at', sinceIso);
    if (error) return 0;
    return count ?? 0;
  },

  async countBannedUsers() {
    const { count: suspended } = await supabaseAdmin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('account_status', 'suspended');
    const { count: disabled } = await supabaseAdmin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('account_status', 'disabled');
    return (suspended ?? 0) + (disabled ?? 0);
  },

  async countUsers() {
    const { count, error } = await supabaseAdmin
      .from('users')
      .select('id', { count: 'exact', head: true });
    if (error) return 0;
    return count ?? 0;
  },

  async countBooksByStatus(status) {
    const { count, error } = await supabaseAdmin
      .from('books')
      .select('id', { count: 'exact', head: true })
      .eq('status', status);
    if (error) return 0;
    return count ?? 0;
  },

  async countBookFormats() {
    const { count, error } = await supabaseAdmin
      .from('book_formats')
      .select('id', { count: 'exact', head: true });
    if (error) return 0;
    return count ?? 0;
  },

  async sumFormatPrices() {
    const { data, error } = await supabaseAdmin
      .from('book_formats')
      .select('price, books!inner(status)');
    if (error) {
      const { data: fallback } = await supabaseAdmin.from('book_formats').select('price');
      return (fallback ?? []).reduce((s, r) => s + Number(r.price || 0), 0);
    }
    return (data ?? []).reduce((s, r) => s + Number(r.price || 0), 0);
  },

  async listRecentTransactions(limit = 20) {
    const { data, error } = await supabaseAdmin
      .from('book_formats')
      .select(
        `
        id,
        format_type,
        price,
        currency,
        created_at,
        books (
          id,
          title,
          status,
          updated_at
        )
      `,
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      const { data: books } = await supabaseAdmin
        .from('books')
        .select('id, title, status, updated_at, created_at')
        .order('updated_at', { ascending: false })
        .limit(limit);
      return (books ?? []).map((b) => ({
        id: b.id,
        format_type: 'Catalog',
        price: 0,
        currency: 'ETB',
        created_at: b.updated_at || b.created_at,
        books: b,
      }));
    }
    return data ?? [];
  },

  async revenueByDay(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await supabaseAdmin
      .from('book_formats')
      .select('price, created_at')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true });

    if (error) return [];

    const buckets = {};
    for (const row of data ?? []) {
      const day = row.created_at?.slice(0, 10);
      if (!day) continue;
      buckets[day] = (buckets[day] || 0) + Number(row.price || 0);
    }

    return Object.entries(buckets).map(([date, amount]) => ({ date, amount }));
  },
};
