import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

function buildLast30DaysCountSeries(byDay) {
  const series = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    series.push({ date, count: byDay[date]?.count || 0 });
  }
  return series;
}

function buildLast30DaysSalesSeries(byDay) {
  const series = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    const row = byDay[date];
    series.push({
      date,
      sales: row?.sales || 0,
      revenue: Math.round((row?.revenue || 0) * 100) / 100,
    });
  }
  return series;
}

function pickRelation(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatAdminBookRow(row) {
  if (!row) return null;
  const uploader = pickRelation(row.uploader);
  const genre = pickRelation(row.genre);
  const formats = Array.isArray(row.book_formats) ? row.book_formats : [];

  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle ?? null,
    description: row.description ?? null,
    author_name: row.author_name,
    language: row.language,
    status: row.status,
    is_active: row.is_active,
    cover_image_url: row.cover_image_url ?? null,
    uploaded_by: row.uploaded_by,
    uploaded_by_role: row.uploaded_by_role ?? null,
    uploader_email: uploader?.email ?? null,
    genre_name: genre?.name ?? null,
    isbn: row.isbn ?? null,
    publisher_name: row.publisher_name ?? null,
    publication_date: row.publication_date ?? null,
    reviewed_at: row.reviewed_at ?? null,
    updated_at: row.updated_at ?? null,
    created_at: row.created_at,
    formats: formats.map((f) => ({
      id: f.id,
      format_type: f.format_type,
      price: f.price,
      status: f.status,
      is_active: f.is_active,
      storage_path: f.storage_path ?? null,
      file_size_bytes: f.file_size_bytes ?? null,
      page_count: f.page_count ?? null,
      duration_sec: f.duration_sec ?? null,
      preview_url: f.preview_url ?? null,
    })),
  };
}

async function attachFormatPreviewUrls(formats) {
  const list = formats || [];
  return Promise.all(
    list.map(async (f) => {
      if (!f.storage_path) return { ...f, preview_url: null };
      const { data, error } = await supabaseAdmin.storage
        .from('booknest')
        .createSignedUrl(f.storage_path, 3600);
      if (error) {
        logger.warn('Admin book preview URL failed', { path: f.storage_path, error: error.message });
        return { ...f, preview_url: null };
      }
      return { ...f, preview_url: data?.signedUrl ?? null };
    })
  );
}

function pickProfile(row, key) {
  const value = row[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function pickDisplayName(row) {
  const reader = pickProfile(row, 'reader_profiles');
  const author = pickProfile(row, 'author_profiles');
  const publisher = pickProfile(row, 'publisher_profiles');
  const admin = pickProfile(row, 'admin_profiles');

  return (
    reader?.display_name ||
    author?.pen_name ||
    publisher?.company_name ||
    admin?.display_name ||
    row.email?.split('@')[0] ||
    'User'
  );
}

function formatAdminUserRow(row) {
  if (!row) return null;

  const reader = pickProfile(row, 'reader_profiles');
  const author = pickProfile(row, 'author_profiles');
  const publisher = pickProfile(row, 'publisher_profiles');
  const admin = pickProfile(row, 'admin_profiles');

  return {
    id: row.id,
    email: row.email,
    role: row.role,
    account_status: row.account_status,
    is_email_verified: row.is_email_verified,
    created_at: row.created_at,
    display_name: pickDisplayName(row),
    avatar_url:
      reader?.avatar_url ||
      author?.avatar_url ||
      publisher?.avatar_url ||
      admin?.avatar_url ||
      null,
    bio: reader?.bio || author?.bio || publisher?.bio || admin?.bio || null,
  };
}

export const adminRepository = {
  async getDashboardStats() {
    const [
      usersRes,
      booksRes,
      pendingBooksRes,
      reportsRes,
      withdrawalsRes,
      transactionsRes,
    ] = await Promise.all([
      supabaseAdmin.from('users').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('books').select('id', { count: 'exact', head: true }),
      supabaseAdmin
        .from('books')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending_review'),
      supabaseAdmin
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabaseAdmin
        .from('withdrawal_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabaseAdmin
        .from('transactions')
        .select('amount')
        .eq('status', 'completed'),
    ]);

    const totalRevenue = (transactionsRes.data || []).reduce(
      (sum, row) => sum + parseFloat(row.amount || 0),
      0
    );

    return {
      total_users: usersRes.count ?? 0,
      total_books: booksRes.count ?? 0,
      pending_books: pendingBooksRes.count ?? 0,
      pending_reports: reportsRes.count ?? 0,
      pending_withdrawals: withdrawalsRes.count ?? 0,
      total_revenue: Math.round(totalRevenue * 100) / 100,
    };
  },

  async getSystemAnalytics() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const since = thirtyDaysAgo.toISOString();

    const [usersRes, booksRes, txRes, rolesRes, bookStatusRes, itemsRes] = await Promise.all([
      supabaseAdmin.from('users').select('created_at').gte('created_at', since),
      supabaseAdmin.from('books').select('created_at').gte('created_at', since),
      supabaseAdmin
        .from('transactions')
        .select('amount, created_at')
        .eq('status', 'completed')
        .gte('created_at', since),
      supabaseAdmin.from('users').select('role'),
      supabaseAdmin.from('books').select('status'),
      supabaseAdmin
        .from('transaction_items')
        .select('amount, book_format_id, transaction:transactions!inner(status)'),
    ]);

    const usersByDay = {};
    for (const u of usersRes.data || []) {
      const day = u.created_at?.slice(0, 10);
      if (!day) continue;
      if (!usersByDay[day]) usersByDay[day] = { count: 0 };
      usersByDay[day].count += 1;
    }

    const booksByDay = {};
    for (const b of booksRes.data || []) {
      const day = b.created_at?.slice(0, 10);
      if (!day) continue;
      if (!booksByDay[day]) booksByDay[day] = { count: 0 };
      booksByDay[day].count += 1;
    }

    const salesByDay = {};
    for (const t of txRes.data || []) {
      const day = t.created_at?.slice(0, 10);
      if (!day) continue;
      if (!salesByDay[day]) salesByDay[day] = { sales: 0, revenue: 0 };
      salesByDay[day].sales += 1;
      salesByDay[day].revenue += parseFloat(t.amount) || 0;
    }

    const usersByRole = {};
    for (const u of rolesRes.data || []) {
      const role = u.role || 'unknown';
      usersByRole[role] = (usersByRole[role] || 0) + 1;
    }

    const booksByStatus = {};
    for (const b of bookStatusRes.data || []) {
      const status = b.status || 'unknown';
      booksByStatus[status] = (booksByStatus[status] || 0) + 1;
    }

    const bookSales = {};
    const completedItems = (itemsRes.data || []).filter(
      (item) => item.transaction?.status === 'completed'
    );
    const formatIds = [...new Set(completedItems.map((i) => i.book_format_id).filter(Boolean))];

    if (formatIds.length) {
      const { data: formats } = await supabaseAdmin
        .from('book_formats')
        .select('id, book_id, book:books(id, title)')
        .in('id', formatIds);

      const formatToBook = {};
      for (const f of formats || []) {
        const book = pickRelation(f.book);
        formatToBook[f.id] = {
          book_id: book?.id || f.book_id,
          title: book?.title || 'Untitled',
        };
      }

      for (const item of completedItems) {
        const meta = formatToBook[item.book_format_id];
        if (!meta?.book_id) continue;
        if (!bookSales[meta.book_id]) {
          bookSales[meta.book_id] = {
            book_id: meta.book_id,
            title: meta.title,
            copies_sold: 0,
            revenue: 0,
          };
        }
        bookSales[meta.book_id].copies_sold += 1;
        bookSales[meta.book_id].revenue += parseFloat(item.amount) || 0;
      }
    }

    const topBooks = Object.values(bookSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((b) => ({
        ...b,
        revenue: Math.round(b.revenue * 100) / 100,
      }));

    return {
      period_days: 30,
      users_over_time: buildLast30DaysCountSeries(usersByDay),
      books_over_time: buildLast30DaysCountSeries(booksByDay),
      sales_over_time: buildLast30DaysSalesSeries(salesByDay),
      users_by_role: Object.entries(usersByRole)
        .map(([role, count]) => ({ role, count }))
        .sort((a, b) => b.count - a.count),
      books_by_status: Object.entries(booksByStatus)
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count),
      top_books: topBooks,
    };
  },

  async listUsers({ role, q, account_status, limit = 50, offset = 0 } = {}) {
    let query = supabaseAdmin
      .from('users')
      .select(
        `
        id, email, role, account_status, is_email_verified, created_at,
        reader_profiles (display_name, avatar_url),
        author_profiles (pen_name, avatar_url),
        publisher_profiles (company_name, avatar_url),
        admin_profiles (display_name, avatar_url)
      `
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (role) query = query.eq('role', role);
    if (account_status) query = query.eq('account_status', account_status);

    const { data, error } = await query;
    if (error) throw error;

    let rows = data || [];
    if (q?.trim()) {
      const needle = q.trim().toLowerCase();
      rows = rows.filter((item) => {
        const reader = pickProfile(item, 'reader_profiles');
        const author = pickProfile(item, 'author_profiles');
        const publisher = pickProfile(item, 'publisher_profiles');
        const admin = pickProfile(item, 'admin_profiles');
        const name =
          reader?.display_name ||
          author?.pen_name ||
          publisher?.company_name ||
          admin?.display_name ||
          '';
        return (
          item.email?.toLowerCase().includes(needle) ||
          name.toLowerCase().includes(needle)
        );
      });
    }

    return rows.map(formatAdminUserRow);
  },

  async getUserById(userId) {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select(
        `
        id, email, role, account_status, is_email_verified, created_at, updated_at,
        reader_profiles (display_name, avatar_url, bio),
        author_profiles (pen_name, avatar_url, bio, full_name),
        publisher_profiles (company_name, avatar_url, bio),
        admin_profiles (display_name, avatar_url, bio)
      `
      )
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const user = formatAdminUserRow(data);

    const [postsRes, booksRes, reportsOnUserRes, postIdsRes] = await Promise.all([
      supabaseAdmin
        .from('posts')
        .select('id, content, image_url, status, like_count, comment_count, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabaseAdmin
        .from('books')
        .select('id, title, status, cover_image_url, is_active, created_at')
        .eq('uploaded_by', userId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabaseAdmin
        .from('reports')
        .select(
          `id, target_type, target_id, reason, details, status, created_at, reporter:reporter_id (id, email)`
        )
        .eq('target_type', 'user')
        .eq('target_id', userId)
        .order('created_at', { ascending: false }),
      supabaseAdmin.from('posts').select('id').eq('user_id', userId),
    ]);

    const postIds = (postIdsRes.data || []).map((p) => p.id);
    let reportsOnPosts = [];

    if (postIds.length) {
      const { data: postReports, error: postReportsError } = await supabaseAdmin
        .from('reports')
        .select(
          `id, target_type, target_id, reason, details, status, created_at, reporter:reporter_id (id, email)`
        )
        .eq('target_type', 'post')
        .in('target_id', postIds)
        .order('created_at', { ascending: false });

      if (postReportsError) throw postReportsError;
      reportsOnPosts = postReports || [];
    }

    const posts = postsRes.data || [];
    const postMap = new Map(posts.map((p) => [p.id, p]));
    const allReports = [...(reportsOnUserRes.data || []), ...reportsOnPosts];

    const reports = allReports.map((report) => {
      const post = report.target_type === 'post' ? postMap.get(report.target_id) : null;
      return {
        ...report,
        post: post
          ? {
              id: post.id,
              content: post.content,
              image_url: post.image_url,
              status: post.status,
              created_at: post.created_at,
            }
          : null,
      };
    });

    return {
      user,
      stats: {
        post_count: posts.length,
        book_count: (booksRes.data || []).length,
        pending_report_count: reports.filter((r) => r.status === 'pending').length,
      },
      posts,
      books: booksRes.data || [],
      reports,
    };
  },

  async setUserContentVisibility(userId, visible) {
    if (visible) {
      await supabaseAdmin
        .from('posts')
        .update({ status: 'published', updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('status', 'hidden');

      await supabaseAdmin
        .from('books')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('uploaded_by', userId)
        .eq('status', 'approved');
    } else {
      await supabaseAdmin
        .from('posts')
        .update({ status: 'hidden', updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .in('status', ['published', 'draft']);

      await supabaseAdmin
        .from('books')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('uploaded_by', userId);
    }
  },

  async updateUserStatus(userId, account_status) {
    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ account_status, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select('id, email, role, account_status')
      .single();

    if (error) throw error;
    return data;
  },

  async listBooks({ status, q, limit = 50, offset = 0 } = {}) {
    let query = supabaseAdmin
      .from('books')
      .select(
        `
        id, title, subtitle, description, author_name, language, status, is_active,
        reviewed_at, created_at, cover_image_url, uploaded_by, uploaded_by_role,
        uploader:uploaded_by (email),
        genre:genre_id (name, slug),
        book_formats (id, format_type, price, status, is_active)
      `
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    query = query.neq('status', 'draft');

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    let rows = data || [];
    if (q?.trim()) {
      const needle = q.trim().toLowerCase();
      rows = rows.filter(
        (b) =>
          b.title?.toLowerCase().includes(needle) ||
          b.author_name?.toLowerCase().includes(needle)
      );
    }
    return rows.map(formatAdminBookRow).filter(Boolean);
  },

  async getBookById(bookId) {
    const { data, error } = await supabaseAdmin
      .from('books')
      .select(
        `
        id, title, subtitle, description, author_name, language, status, is_active, isbn,
        reviewed_at, created_at, updated_at, cover_image_url, uploaded_by, uploaded_by_role,
        publication_date, publisher_name,
        uploader:uploaded_by (email),
        genre:genre_id (name, slug),
        book_formats (id, format_type, price, status, is_active, storage_path, file_size_bytes, page_count, duration_sec)
      `
      )
      .eq('id', bookId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    if (data.status === 'draft') return null;

    const formatsWithUrls = await attachFormatPreviewUrls(data.book_formats || []);
    return formatAdminBookRow({ ...data, book_formats: formatsWithUrls });
  },

  async reviewBook(bookId, adminId, { status }) {
    const updates = {
      status,
      reviewed_by_admin_id: adminId,
      reviewed_at: new Date().toISOString(),
    };

    if (status === 'approved') {
      updates.is_active = true;
    }

    const { data, error } = await supabaseAdmin
      .from('books')
      .update(updates)
      .eq('id', bookId)
      .select('*')
      .single();

    if (error) throw error;

    if (status === 'approved') {
      await supabaseAdmin
        .from('book_formats')
        .update({ status: 'approved', is_active: true })
        .eq('book_id', bookId);
    } else if (status === 'rejected') {
      await supabaseAdmin
        .from('book_formats')
        .update({ status: 'rejected', is_active: false })
        .eq('book_id', bookId);
    }

    return formatAdminBookRow({
      ...data,
      uploader: null,
      genre: null,
      book_formats: [],
    });
  },

  async listReports({ status, limit = 50, offset = 0 } = {}) {
    let query = supabaseAdmin
      .from('reports')
      .select(
        `
        id, target_type, target_id, reason, details, status, created_at,
        reporter:reporter_id (id, email)
      `
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];
    const postTargetIds = rows
      .filter((r) => r.target_type === 'post')
      .map((r) => r.target_id);

    let postMap = new Map();
    if (postTargetIds.length) {
      const { data: posts, error: postsError } = await supabaseAdmin
        .from('posts')
        .select(
          `id, content, image_url, status, created_at, user_id,
          author:user_id (id, email)`
        )
        .in('id', postTargetIds);

      if (postsError) throw postsError;
      postMap = new Map((posts || []).map((p) => [p.id, p]));
    }

    const userTargetIds = rows
      .filter((r) => r.target_type === 'user')
      .map((r) => r.target_id);
    let userMap = new Map();
    if (userTargetIds.length) {
      const { data: users, error: usersError } = await supabaseAdmin
        .from('users')
        .select('id, email, role, account_status')
        .in('id', userTargetIds);
      if (usersError) throw usersError;
      userMap = new Map((users || []).map((u) => [u.id, u]));
    }

    return rows.map((report) => {
      const post = report.target_type === 'post' ? postMap.get(report.target_id) : null;
      const postAuthor = post ? pickRelation(post.author) : null;
      const subject_user_id =
        report.target_type === 'user'
          ? report.target_id
          : post?.user_id ?? null;
      const subjectUser =
        report.target_type === 'user'
          ? userMap.get(report.target_id)
          : postAuthor
            ? { id: post.user_id, email: postAuthor.email, role: null, account_status: null }
            : null;

      return {
        ...report,
        subject_user_id,
        subject_user: subjectUser
          ? {
              id: subjectUser.id,
              email: subjectUser.email,
              role: subjectUser.role ?? null,
              account_status: subjectUser.account_status ?? null,
            }
          : null,
        post: post
          ? {
              id: post.id,
              content: post.content,
              image_url: post.image_url,
              status: post.status,
              created_at: post.created_at,
              author_email: postAuthor?.email ?? null,
            }
          : null,
      };
    });
  },

  async updateReport(reportId, _adminId, { status }) {
    const { data, error } = await supabaseAdmin
      .from('reports')
      .update({ status })
      .eq('id', reportId)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  async listWithdrawals({ status, limit = 50, offset = 0 } = {}) {
    let query = supabaseAdmin
      .from('withdrawal_requests')
      .select(
        `
        id, user_id, amount, currency, status, payout_details, created_at,
        user:user_id (email, role)
      `
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((row) => {
      const user = pickRelation(row.user);
      return {
        id: row.id,
        user_id: row.user_id,
        amount: row.amount,
        currency: row.currency,
        status: row.status,
        payout_details: row.payout_details,
        created_at: row.created_at,
        user_email: user?.email ?? null,
        user_role: user?.role ?? null,
      };
    });
  },

  async getWithdrawalById(id) {
    const { data, error } = await supabaseAdmin
      .from('withdrawal_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async updateWithdrawal(id, updates) {
    const { data, error } = await supabaseAdmin
      .from('withdrawal_requests')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async getWallet(userId) {
    const { data, error } = await supabaseAdmin
      .from('seller_wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async updateWallet(userId, updates) {
    const { data, error } = await supabaseAdmin
      .from('seller_wallets')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async createAuthorProfile(payload) {
    const row = {
      user_id: payload.user_id,
      pen_name: payload.pen_name,
      full_name: payload.full_name ?? null,
      bio: payload.bio ?? null,
      avatar_url: payload.avatar_url ?? null,
      website_url: payload.website_url ?? null,
    };
    const { data, error } = await supabaseAdmin
      .from('author_profiles')
      .insert(row)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async createPublisherProfile(payload) {
    const row = {
      user_id: payload.user_id,
      company_name: payload.company_name,
      bio: payload.bio ?? null,
      avatar_url: payload.avatar_url ?? null,
      website_url: payload.website_url ?? null,
      support_email: payload.support_email ?? null,
    };
    const { data, error } = await supabaseAdmin
      .from('publisher_profiles')
      .insert(row)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async linkAuthorProfile(profileUserId, userId) {
    const { data, error } = await supabaseAdmin
      .from('author_profiles')
      .update({
        user_id: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', profileUserId)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async linkPublisherProfile(profileUserId, userId) {
    const { data, error } = await supabaseAdmin
      .from('publisher_profiles')
      .update({
        user_id: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', profileUserId)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async createCategory(body) {
    const { data, error } = await supabaseAdmin
      .from('categories')
      .insert({
        slug: body.slug,
        name: body.name,
        description: body.description || null,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },
};
