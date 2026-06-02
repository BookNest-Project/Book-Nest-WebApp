import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

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

  async listUsers({ role, q, account_status, limit = 50, offset = 0 } = {}) {
    let query = supabaseAdmin
      .from('users')
      .select(
        `
        id, email, role, account_status, is_email_verified, created_at,
        reader_profiles (display_name, avatar_url),
        author_profiles (pen_name, avatar_url),
        publisher_profiles (company_name, logo_url),
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
        const name =
          item.reader_profiles?.display_name ||
          item.author_profiles?.pen_name ||
          item.publisher_profiles?.company_name ||
          item.admin_profiles?.display_name ||
          '';
        return (
          item.email?.toLowerCase().includes(needle) ||
          name.toLowerCase().includes(needle)
        );
      });
    }

    return rows;
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
        id, title, subtitle, status, review_note, submitted_at, reviewed_at, created_at,
        cover_image_url, uploaded_by, uploaded_by_role,
        uploader:uploaded_by (email),
        book_formats (id, format_type, price, status, is_active)
      `
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    let rows = data || [];
    if (q?.trim()) {
      const needle = q.trim().toLowerCase();
      rows = rows.filter((b) => b.title?.toLowerCase().includes(needle));
    }
    return rows;
  },

  async reviewBook(bookId, adminId, { status, review_note }) {
    const updates = {
      status,
      review_note: review_note || null,
      reviewed_by_admin_id: adminId,
      reviewed_at: new Date().toISOString(),
    };

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
        .update({ status: 'approved' })
        .eq('book_id', bookId)
        .eq('is_active', true)
        .in('status', ['pending_review', 'draft']);
    } else if (status === 'rejected') {
      await supabaseAdmin
        .from('book_formats')
        .update({ status: 'rejected' })
        .eq('book_id', bookId)
        .eq('is_active', true);
    }

    return data;
  },

  async listReports({ status = 'pending', limit = 50, offset = 0 } = {}) {
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
    return data || [];
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

  async listWithdrawals({ status = 'pending', limit = 50, offset = 0 } = {}) {
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
    return data || [];
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
    const { data, error } = await supabaseAdmin
      .from('author_profiles')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async createPublisherProfile(payload) {
    const { data, error } = await supabaseAdmin
      .from('publisher_profiles')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async linkAuthorProfile(id, userId, adminId) {
    const { data, error } = await supabaseAdmin
      .from('author_profiles')
      .update({
        user_id: userId,
        approved_by_admin_id: adminId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async linkPublisherProfile(id, userId, adminId) {
    const { data, error } = await supabaseAdmin
      .from('publisher_profiles')
      .update({
        user_id: userId,
        approved_by_admin_id: adminId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id)
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
