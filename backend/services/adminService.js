import { supabaseAdmin } from '../config/supabase.js';
import { authRepository } from '../repositories/authRepository.js';
import { adminRepository } from '../repositories/adminRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { sendWithdrawalEmail } from './emailService.js';

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

export const adminService = {
  getDashboardStats: () => adminRepository.getDashboardStats(),

  getSystemAnalytics: () => adminRepository.getSystemAnalytics(),

  listUsers: (filters) => adminRepository.listUsers(filters),

  getUserById: (userId) => adminRepository.getUserById(userId),

  async updateUserStatus(userId, account_status) {
    if (!['active', 'suspended', 'disabled'].includes(account_status)) {
      throw new ValidationError('Invalid account status');
    }
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError('User not found');
    if (user.role === 'admin') {
      throw new ValidationError('Cannot change status of another admin account');
    }

    const updated = await adminRepository.updateUserStatus(userId, account_status);

    if (account_status === 'active') {
      await adminRepository.setUserContentVisibility(userId, true);
    } else {
      await adminRepository.setUserContentVisibility(userId, false);
    }

    return updated;
  },

  listBooks: (filters) => adminRepository.listBooks(filters),

  getBookById: (bookId) => adminRepository.getBookById(bookId),

  reviewBook: (bookId, adminId, payload) =>
    adminRepository.reviewBook(bookId, adminId, payload),

  listReports: (filters) => adminRepository.listReports(filters),

  updateReport: (reportId, adminId, payload) =>
    adminRepository.updateReport(reportId, adminId, payload),

  listWithdrawals: (filters) => adminRepository.listWithdrawals(filters),

  async reviewWithdrawal(withdrawalId, adminId, { status, admin_note }) {
    if (!['approved', 'rejected'].includes(status)) {
      throw new ValidationError('Status must be approved or rejected');
    }

    const withdrawal = await adminRepository.getWithdrawalById(withdrawalId);
    if (!withdrawal) throw new NotFoundError('Withdrawal request not found');
    if (withdrawal.status !== 'pending') {
      throw new ValidationError('This withdrawal was already processed');
    }

    const wallet = await adminRepository.getWallet(withdrawal.user_id);
    const amount = parseFloat(withdrawal.amount) || 0;

    if (status === 'rejected' && wallet) {
      const available = parseFloat(wallet.available_balance) || 0;
      const pending = parseFloat(wallet.pending_balance) || 0;
      await adminRepository.updateWallet(withdrawal.user_id, {
        available_balance: roundMoney(available + amount),
        pending_balance: roundMoney(Math.max(0, pending - amount)),
      });
    }

    if (status === 'approved' && wallet) {
      const pending = parseFloat(wallet.pending_balance) || 0;
      await adminRepository.updateWallet(withdrawal.user_id, {
        pending_balance: roundMoney(Math.max(0, pending - amount)),
      });
    }

    const updated = await adminRepository.updateWithdrawal(withdrawalId, {
      status,
    });

    const user = await userRepository.findById(withdrawal.user_id);
    if (user?.email) {
      try {
        await sendWithdrawalEmail(user.email, {
          status,
          amount,
          currency: withdrawal.currency || 'ETB',
          adminNote: admin_note,
        });
      } catch (err) {
        logger.warn('Withdrawal status email failed', { error: err.message });
      }
    }

    return updated;
  },

  /**
   * Invite author or publisher — sends Supabase invite email.
   * Readers self-register on the main app; not invitable here.
   */
  async inviteUser(adminId, { email, role, display_name, pen_name, company_name }) {
    const normalized = email.trim().toLowerCase();

    if (!['author', 'publisher'].includes(role)) {
      throw new ValidationError('Only author and publisher roles can be invited');
    }

    const existing = await userRepository.findByEmail(normalized);
    if (existing) {
      throw new ValidationError('A user with this email already exists');
    }

    const redirectTo = authRepository.getInviteRegistrationRedirectUrl();
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(normalized, {
      redirectTo,
      data: {
        display_name: display_name || pen_name || company_name || normalized.split('@')[0],
        role,
        needs_profile_setup: true,
      },
    });

    if (error) {
      logger.error('Admin invite failed', { email: normalized, error: error.message });
      throw new ValidationError(error.message || 'Failed to send invite');
    }

    const userId = data.user.id;

    await supabaseAdmin.auth.admin.updateUserById(userId, {
      app_metadata: { role },
      user_metadata: {
        display_name: display_name || pen_name || company_name,
        role,
        needs_profile_setup: true,
      },
    });

    await authRepository.ensurePublicUserRecord(data.user);

    await supabaseAdmin
      .from('users')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', userId);

    // Profile (pen name / company name) is completed by the user on first sign-in.
    logger.info('User invited', { userId, email: normalized, role, adminId });

    return {
      user_id: userId,
      email: normalized,
      role,
      invite_sent: true,
    };
  },

  createAuthorProfile: (adminId, body) =>
    adminRepository.createAuthorProfile({
      user_id: body.user_id,
      pen_name: body.pen_name,
      full_name: body.full_name || null,
      bio: body.bio || null,
      avatar_url: body.avatar_url || null,
      website_url: body.website_url || null,
    }),

  createPublisherProfile: (adminId, body) =>
    adminRepository.createPublisherProfile({
      user_id: body.user_id,
      company_name: body.company_name,
      bio: body.bio || null,
      avatar_url: body.avatar_url || body.logo_url || null,
      website_url: body.website_url || null,
      support_email: body.support_email || null,
    }),

  linkAuthorProfile: (id, userId, adminId) =>
    adminRepository.linkAuthorProfile(id, userId, adminId),

  linkPublisherProfile: (id, userId, adminId) =>
    adminRepository.linkPublisherProfile(id, userId, adminId),

  createCategory: (body) => adminRepository.createCategory(body),

  reviewBookFormat: async (bookId, formatId, { status }) => {
    const isActive = status === 'approved';
    const { data, error } = await supabaseAdmin
      .from('book_formats')
      .update({
        status,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', formatId)
      .eq('book_id', bookId)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },
};
