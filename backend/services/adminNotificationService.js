import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { sendEmail } from './emailService.js';

const APP_URL = process.env.ADMIN_APP_URL || 'http://localhost:3001';

async function findAdminUsers() {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, email')
    .eq('role', 'admin')
    .eq('account_status', 'active');

  if (error) {
    logger.warn('findAdminUsers failed', { error: error.message });
    return [];
  }
  return data ?? [];
}

async function insertNotification({ adminId, bookId, type, title, body }) {
  const { error } = await supabaseAdmin.from('admin_notifications').insert({
    admin_id: adminId,
    book_id: bookId,
    notification_type: type,
    title,
    body,
  });

  if (error) {
    if (error.message?.includes('admin_notifications')) {
      return false;
    }
    logger.warn('insertNotification failed', { error: error.message });
  }
  return true;
}

export const adminNotificationService = {
  async notifyAdminsNewSubmission(book) {
    if (!book?.id) return;

    const admins = await findAdminUsers();
    const title = book.title || 'Untitled';
    const author = book.author_name || 'Unknown author';
    const reviewUrl = `${APP_URL}/dashboard/books/${book.id}`;
    const subject = `New submission pending review: ${title}`;
    const body = [
      `A book was submitted for your review.`,
      ``,
      `Title: ${title}`,
      `Author: ${author}`,
      `Status: pending_review`,
      ``,
      `Open in admin console: ${reviewUrl}`,
    ].join('\n');

    await Promise.all(
      admins.map(async (admin) => {
        await insertNotification({
          adminId: admin.id,
          bookId: book.id,
          type: 'pending_submission',
          title: `New submission: ${title}`,
          body: `${author} submitted "${title}" for review.`,
        });

        await sendEmail({
          to: admin.email,
          subject,
          text: body,
          html: `<p>A book was submitted for review.</p>
            <p><strong>${title}</strong> by ${author}</p>
            <p><a href="${reviewUrl}">Review in BookNest Admin</a></p>`,
        });
      }),
    );

    logger.info('Admin notified of new submission', {
      bookId: book.id,
      adminCount: admins.length,
    });
  },

  async getNotificationsForAdmin(adminId, { limit = 20, unreadOnly = false } = {}) {
    let query = supabaseAdmin
      .from('admin_notifications')
      .select('id, book_id, notification_type, title, body, read_at, created_at')
      .eq('admin_id', adminId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.is('read_at', null);
    }

    const { data, error } = await query;

    if (error) {
      if (error.message?.includes('admin_notifications')) {
        return { items: [], unreadCount: 0 };
      }
      throw error;
    }

    const items = data ?? [];
    let unreadCount = items.filter((n) => !n.read_at).length;

    const { count, error: countError } = await supabaseAdmin
      .from('admin_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('admin_id', adminId)
      .is('read_at', null);

    if (!countError && count != null) {
      unreadCount = count;
    }

    return { items, unreadCount };
  },

  async markNotificationRead(notificationId, adminId) {
    const { error } = await supabaseAdmin
      .from('admin_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('admin_id', adminId);

    if (error && !error.message?.includes('admin_notifications')) {
      throw error;
    }
  },

  async markAllRead(adminId) {
    const { error } = await supabaseAdmin
      .from('admin_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('admin_id', adminId)
      .is('read_at', null);

    if (error && !error.message?.includes('admin_notifications')) {
      throw error;
    }
  },
};
