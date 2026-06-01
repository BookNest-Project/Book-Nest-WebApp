import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

function tableMissing(error, name) {
  const msg = error?.message || '';
  return msg.includes(name) || msg.includes('does not exist') || error?.code === '42P01';
}

export const adminTasksRepository = {
  async logTask({ adminId, category, action, summary, bookId = null, targetUserId = null, details = null }) {
    const { error } = await supabaseAdmin.from('admin_tasks').insert({
      admin_id: adminId,
      category,
      action,
      summary,
      book_id: bookId,
      target_user_id: targetUserId,
      details,
    });
    if (error) {
      if (tableMissing(error, 'admin_tasks')) {
        logger.warn('logTask skipped — admin_tasks table missing');
        return;
      }
      logger.warn('logTask', { error: error.message });
    }
  },

  async listBookReviewActivity(limit = 300) {
    const { data, error } = await supabaseAdmin
      .from('book_review_activity')
      .select('id, book_id, admin_id, action, details, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      if (tableMissing(error, 'book_review_activity')) return [];
      throw error;
    }
    return (data || []).map((row) => ({
      id: row.id,
      source: 'book_review',
      category: 'books',
      action: row.action,
      summary: null,
      bookId: row.book_id,
      targetUserId: null,
      adminId: row.admin_id,
      details: row.details,
      createdAt: row.created_at,
    }));
  },

  async listAdminTasks(limit = 300) {
    const { data, error } = await supabaseAdmin
      .from('admin_tasks')
      .select(
        'id, admin_id, category, action, summary, book_id, target_user_id, details, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      if (tableMissing(error, 'admin_tasks')) return [];
      throw error;
    }
    return (data || []).map((row) => ({
      id: row.id,
      source: 'admin_tasks',
      category: row.category,
      action: row.action,
      summary: row.summary,
      bookId: row.book_id,
      targetUserId: row.target_user_id,
      adminId: row.admin_id,
      details: row.details,
      createdAt: row.created_at,
    }));
  },

  async fetchBooksByIds(ids) {
    if (!ids.length) return new Map();
    const { data, error } = await supabaseAdmin
      .from('books')
      .select('id, title')
      .in('id', ids);
    if (error) return new Map();
    return new Map((data || []).map((b) => [b.id, b.title || 'Untitled']));
  },

  async fetchUsersByIds(ids) {
    if (!ids.length) return new Map();
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, email, role')
      .in('id', ids);
    if (error) return new Map();
    const map = new Map();
    for (const u of data || []) {
      map.set(u.id, { email: u.email, role: u.role });
    }

    const { data: profiles } = await supabaseAdmin
      .from('admin_profiles')
      .select('user_id, display_name')
      .in('user_id', ids);

    for (const p of profiles || []) {
      const existing = map.get(p.user_id);
      if (existing) {
        existing.displayName = p.display_name;
      } else {
        map.set(p.user_id, { displayName: p.display_name });
      }
    }
    return map;
  },
};
