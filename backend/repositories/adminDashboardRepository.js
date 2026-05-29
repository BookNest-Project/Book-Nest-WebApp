import { supabaseAdmin } from '../config/supabase.js';

export const adminDashboardRepository = {
  async sumPricesByFormatType() {
    const { data, error } = await supabaseAdmin.from('book_formats').select('format_type, price');
    if (error) return { pdf: 0, audio: 0, other: 0, total: 0 };

    const buckets = { pdf: 0, audio: 0, other: 0 };
    for (const row of data ?? []) {
      const price = Number(row.price) || 0;
      const type = (row.format_type || '').toLowerCase();
      if (type.includes('pdf') || type.includes('ebook')) buckets.pdf += price;
      else if (type.includes('audio')) buckets.audio += price;
      else buckets.other += price;
    }
    return {
      ...buckets,
      total: buckets.pdf + buckets.audio + buckets.other,
    };
  },

  async topGenreByBookCount() {
    const { data: books, error } = await supabaseAdmin
      .from('books')
      .select('genre_id, genres ( name )')
      .eq('status', 'approved')
      .limit(200);
    if (error || !books?.length) return null;

    const counts = {};
    for (const book of books) {
      const name = book.genres?.name || 'General';
      counts[name] = (counts[name] || 0) + 1;
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (!top) return null;
    return { name: top[0], count: top[1] };
  },

  async dailyActivity(days = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [usersRes, booksRes] = await Promise.all([
      supabaseAdmin
        .from('users')
        .select('updated_at')
        .gte('updated_at', since.toISOString()),
      supabaseAdmin
        .from('books')
        .select('created_at, updated_at')
        .gte('created_at', since.toISOString()),
    ]);

    const userBuckets = {};
    for (const row of usersRes.data ?? []) {
      const day = row.updated_at?.slice(0, 10);
      if (day) userBuckets[day] = (userBuckets[day] || 0) + 1;
    }

    const bookBuckets = {};
    for (const row of booksRes.data ?? []) {
      const day = (row.created_at || row.updated_at)?.slice(0, 10);
      if (day) bookBuckets[day] = (bookBuckets[day] || 0) + 1;
    }

    return { userBuckets, bookBuckets };
  },

  async countUsersActiveSince(sinceIso) {
    const { count, error } = await supabaseAdmin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .gte('updated_at', sinceIso);
    if (error) return 0;
    return count ?? 0;
  },
};
