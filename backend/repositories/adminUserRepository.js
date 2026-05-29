import { supabaseAdmin } from '../config/supabase.js';

const USER_COLUMNS = `
  id,
  email,
  role,
  account_status,
  created_at,
  updated_at
`;

const USER_COLUMNS_EXTENDED = `
  ${USER_COLUMNS.trim()},
  account_status_reason,
  status_updated_at
`;

export const adminUserRepository = {
  async countAll() {
    const { count, error } = await supabaseAdmin
      .from('users')
      .select('id', { count: 'exact', head: true });
    if (error) throw error;
    return count ?? 0;
  },

  async countByStatus(status) {
    const { count, error } = await supabaseAdmin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('account_status', status);
    if (error) throw error;
    return count ?? 0;
  },

  async countByRole(role) {
    const { count, error } = await supabaseAdmin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', role);
    if (error) throw error;
    return count ?? 0;
  },

  async countActiveAuthors() {
    const { count, error } = await supabaseAdmin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'author')
      .eq('account_status', 'active');
    if (error) throw error;
    return count ?? 0;
  },

  async countVerifiedAuthors() {
    const authorIds = await adminUserRepository.getAuthorProfileUserIds();
    if (!authorIds.length) return 0;

    const { count, error } = await supabaseAdmin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'author')
      .eq('account_status', 'active')
      .in('id', authorIds);
    if (error) throw error;
    return count ?? 0;
  },

  async countBannedUsers() {
    const { count, error } = await supabaseAdmin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .in('account_status', ['suspended', 'disabled']);
    if (error) throw error;
    return count ?? 0;
  },

  async listUsers({ page = 1, limit = 10, search = '', role = null, status = null, statuses = null }) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from('users')
      .select(USER_COLUMNS_EXTENDED, { count: 'exact' })
      .order('updated_at', { ascending: false });

    if (role) query = query.eq('role', role);
    if (statuses?.length) query = query.in('account_status', statuses);
    else if (status) query = query.eq('account_status', status);
    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      query = query.ilike('email', term);
    }

    let { data, error, count } = await query.range(from, to);

    if (error?.message?.includes('account_status_reason')) {
      let fallbackQuery = supabaseAdmin
        .from('users')
        .select(USER_COLUMNS, { count: 'exact' })
        .order('updated_at', { ascending: false });

      if (role) fallbackQuery = fallbackQuery.eq('role', role);
      if (statuses?.length) fallbackQuery = fallbackQuery.in('account_status', statuses);
      else if (status) fallbackQuery = fallbackQuery.eq('account_status', status);
      if (search?.trim()) {
        fallbackQuery = fallbackQuery.ilike('email', `%${search.trim()}%`);
      }

      ({ data, error, count } = await fallbackQuery.range(from, to));
    }

    if (error) throw error;
    return { users: data ?? [], total: count ?? 0 };
  },

  async listUsersByIds({ userIds, page = 1, limit = 10, search = '', role = null }) {
    if (!userIds.length) return { users: [], total: 0 };

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from('users')
      .select(USER_COLUMNS_EXTENDED, { count: 'exact' })
      .in('id', userIds)
      .order('updated_at', { ascending: false });

    if (role) query = query.eq('role', role);
    if (search?.trim()) {
      query = query.ilike('email', `%${search.trim()}%`);
    }

    let { data, error, count } = await query.range(from, to);

    if (error?.message?.includes('account_status_reason')) {
      let fallbackQuery = supabaseAdmin
        .from('users')
        .select(USER_COLUMNS, { count: 'exact' })
        .in('id', userIds)
        .order('updated_at', { ascending: false });

      if (role) fallbackQuery = fallbackQuery.eq('role', role);
      if (search?.trim()) {
        fallbackQuery = fallbackQuery.ilike('email', `%${search.trim()}%`);
      }

      ({ data, error, count } = await fallbackQuery.range(from, to));
    }

    if (error) throw error;
    return { users: data ?? [], total: count ?? 0 };
  },

  async getAuthorProfileUserIds() {
    const { data, error } = await supabaseAdmin.from('author_profiles').select('user_id');
    if (error) return [];
    return (data ?? []).map((row) => row.user_id);
  },

  async listAllUsersRaw({ search = '', role = null, max = 5000 }) {
    let query = supabaseAdmin
      .from('users')
      .select(USER_COLUMNS)
      .order('updated_at', { ascending: false })
      .limit(max);

    if (role) query = query.eq('role', role);
    if (search?.trim()) query = query.ilike('email', `%${search.trim()}%`);

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async listAllUsers({ search = '', role = null, status = null, max = 5000 }) {
    let query = supabaseAdmin
      .from('users')
      .select(USER_COLUMNS)
      .order('updated_at', { ascending: false })
      .limit(max);

    if (role) query = query.eq('role', role);
    if (status) query = query.eq('account_status', status);
    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      query = query.ilike('email', term);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async findReaderProfiles(userIds) {
    if (!userIds.length) return [];
    const { data, error } = await supabaseAdmin
      .from('reader_profiles')
      .select('user_id, display_name, avatar_url, bio')
      .in('user_id', userIds);
    if (error) return [];
    return data ?? [];
  },

  async findAuthorProfiles(userIds) {
    if (!userIds.length) return [];
    const { data, error } = await supabaseAdmin
      .from('author_profiles')
      .select('user_id, pen_name, full_name, avatar_url, bio, website_url')
      .in('user_id', userIds);
    if (error) return [];
    return data ?? [];
  },

  async findPublisherProfiles(userIds) {
    if (!userIds.length) return [];
    const { data, error } = await supabaseAdmin
      .from('publisher_profiles')
      .select('user_id, company_name, avatar_url, bio, website_url, support_email')
      .in('user_id', userIds);
    if (error) return [];
    return data ?? [];
  },

  async findAdminProfiles(userIds) {
    if (!userIds.length) return [];
    const { data, error } = await supabaseAdmin
      .from('admin_profiles')
      .select('user_id, display_name, avatar_url, bio')
      .in('user_id', userIds);
    if (error) return [];
    return data ?? [];
  },

  async findUserById(userId) {
    let { data, error } = await supabaseAdmin
      .from('users')
      .select(USER_COLUMNS_EXTENDED)
      .eq('id', userId)
      .maybeSingle();

    if (error?.message?.includes('account_status_reason')) {
      ({ data, error } = await supabaseAdmin
        .from('users')
        .select(USER_COLUMNS)
        .eq('id', userId)
        .maybeSingle());
    }

    if (error) throw error;
    return data;
  },

  async updateAccountStatus(userId, { status, reason = null }) {
    const now = new Date().toISOString();
    const payload = {
      account_status: status,
      updated_at: now,
      status_updated_at: now,
      account_status_reason: status === 'active' ? null : reason,
    };

    let { data, error } = await supabaseAdmin
      .from('users')
      .update(payload)
      .eq('id', userId)
      .select(USER_COLUMNS_EXTENDED)
      .single();

    if (error?.message?.includes('account_status_reason')) {
      ({ data, error } = await supabaseAdmin
        .from('users')
        .update({ account_status: status, updated_at: now })
        .eq('id', userId)
        .select(USER_COLUMNS)
        .single());
    }

    if (error) throw error;
    return data;
  },

  async countBooksByAuthor(userId) {
    const { count, error } = await supabaseAdmin
      .from('books')
      .select('id', { count: 'exact', head: true })
      .or(`author_user_id.eq.${userId},uploaded_by.eq.${userId}`);
    if (error) return 0;
    return count ?? 0;
  },

  async listBooksByUser(userId, limit = 50) {
    const { data, error } = await supabaseAdmin
      .from('books')
      .select(
        `
        id,
        title,
        status,
        cover_image_url,
        updated_at,
        created_at,
        genres ( name )
      `,
      )
      .or(`author_user_id.eq.${userId},uploaded_by.eq.${userId}`)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      const { data: fallback } = await supabaseAdmin
        .from('books')
        .select('id, title, status, cover_image_url, updated_at, created_at')
        .or(`author_user_id.eq.${userId},uploaded_by.eq.${userId}`)
        .order('updated_at', { ascending: false })
        .limit(limit);
      return fallback ?? [];
    }
    return data ?? [];
  },
};
