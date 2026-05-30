import { supabaseAdmin } from '../config/supabase.js';
import { adminUserRepository } from '../repositories/adminUserRepository.js';
import { adminUserService } from './adminUserService.js';
import { logger } from '../utils/logger.js';

const MAX_ROWS = 100;
const ROLES = new Set(['reader', 'author', 'publisher', 'admin']);
const STATUSES = new Set(['active', 'suspended', 'disabled']);
const ACTIONS = new Set(['create', 'update']);

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeAction(value) {
  const action = String(value || 'create').trim().toLowerCase();
  return ACTIONS.has(action) ? action : 'create';
}

function normalizeRole(value) {
  const role = String(value || 'reader').trim().toLowerCase();
  return ROLES.has(role) ? role : null;
}

function normalizeStatus(value) {
  const status = String(value || 'active').trim().toLowerCase();
  return STATUSES.has(status) ? status : null;
}

function rowLabel(row, index) {
  return row.email || `Row ${index + 1}`;
}

async function findUserByEmail(email) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, email, role, account_status')
    .eq('email', email)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function upsertProfile(table, row) {
  const { error } = await supabaseAdmin.from(table).upsert(row, { onConflict: 'user_id' });
  if (error) throw error;
}

async function createRoleProfile(userId, role, name) {
  const safeName = (name || 'User').trim().slice(0, 80);
  if (safeName.length < 2) {
    throw new Error('Name must be at least 2 characters');
  }

  if (role === 'reader') {
    await upsertProfile('reader_profiles', {
      user_id: userId,
      display_name: safeName,
    });
    return;
  }

  if (role === 'author') {
    await upsertProfile('author_profiles', {
      user_id: userId,
      pen_name: safeName,
      full_name: safeName,
    });
    return;
  }

  if (role === 'publisher') {
    await upsertProfile('publisher_profiles', {
      user_id: userId,
      company_name: safeName,
    });
    return;
  }

  if (role === 'admin') {
    const { error } = await supabaseAdmin.from('admin_profiles').upsert(
      { user_id: userId, display_name: safeName },
      { onConflict: 'user_id' },
    );
    if (error) {
      logger.warn('admin_profiles upsert skipped on bulk create', { userId, error: error.message });
    }
  }
}

async function createUserFromRow(row, adminId) {
  const email = normalizeEmail(row.email);
  const role = normalizeRole(row.role);
  const password = String(row.password || '').trim();
  const name = String(row.name || row.display_name || row.pen_name || '').trim();

  if (!email) throw new Error('Email is required');
  if (!role) throw new Error('Invalid role (reader, author, publisher, admin)');
  if (password.length < 6) throw new Error('Password must be at least 6 characters');
  if (name.length < 2) throw new Error('Name is required (min 2 characters)');
  if (role === 'admin') throw new Error('Cannot bulk-create admin accounts');

  const existing = await findUserByEmail(email);
  if (existing) throw new Error('Email already registered');

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name },
    app_metadata: { role },
  });

  if (authError) {
    if (authError.message?.toLowerCase().includes('already')) {
      throw new Error('Email already registered');
    }
    throw new Error(authError.message || 'Failed to create auth user');
  }

  const userId = authData.user.id;

  const { error: roleError } = await supabaseAdmin
    .from('users')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (roleError) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    throw new Error(roleError.message);
  }

  try {
    await createRoleProfile(userId, role, name);
  } catch (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    throw new Error(profileError.message || 'Failed to create profile');
  }

  const status = normalizeStatus(row.account_status);
  if (status && status !== 'active') {
    await adminUserRepository.updateAccountStatus(userId, {
      status,
      reason: String(row.reason || '').trim() || null,
    });
  }

  logger.info('Bulk user created', { email, role, adminId });
  return { email, userId, action: 'create' };
}

async function updateUserFromRow(row, adminId) {
  const email = normalizeEmail(row.email);
  const status = normalizeStatus(row.account_status);

  if (!email) throw new Error('Email is required');
  if (!status) throw new Error('Invalid account_status (active, suspended, disabled)');

  const user = await findUserByEmail(email);
  if (!user) throw new Error('User not found');

  if (user.role === 'admin') {
    throw new Error('Admin accounts cannot be updated via bulk upload');
  }
  if (user.id === adminId) {
    throw new Error('Cannot update your own account');
  }

  const reason = String(row.reason || '').trim() || null;

  if (status !== 'active' && user.role === 'author' && (!reason || reason.length < 5)) {
    throw new Error('Reason (min 5 chars) required when suspending/disabling authors');
  }

  await adminUserService.updateUserStatus(user.id, {
    accountStatus: status,
    reason,
    adminId,
  });

  logger.info('Bulk user updated', { email, status, adminId });
  return { email, userId: user.id, action: 'update' };
}

export const adminUserBulkService = {
  async processBulkRows(rows, adminId) {
    if (!Array.isArray(rows) || rows.length === 0) {
      const err = new Error('No rows to import');
      err.statusCode = 400;
      throw err;
    }
    if (rows.length > MAX_ROWS) {
      const err = new Error(`Maximum ${MAX_ROWS} rows per upload`);
      err.statusCode = 400;
      throw err;
    }

    const results = [];
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i += 1) {
      const raw = rows[i] || {};
      const email = normalizeEmail(raw.email);
      const action = normalizeAction(raw.action);

      try {
        let outcome;
        if (action === 'update') {
          outcome = await updateUserFromRow(raw, adminId);
        } else {
          outcome = await createUserFromRow(raw, adminId);
        }
        succeeded += 1;
        results.push({
          row: i + 1,
          email,
          action,
          success: true,
          message: action === 'create' ? 'User created' : 'User updated',
          userId: outcome.userId,
        });
      } catch (error) {
        failed += 1;
        results.push({
          row: i + 1,
          email: email || rowLabel(raw, i),
          action,
          success: false,
          message: error.message || 'Failed',
        });
      }
    }

    logger.info('Bulk user import finished', {
      adminId,
      total: rows.length,
      succeeded,
      failed,
    });

    return {
      total: rows.length,
      succeeded,
      failed,
      results,
    };
  },
};
