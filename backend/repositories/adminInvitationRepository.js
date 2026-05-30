import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { adminInvitationFileRepository } from './adminInvitationFileRepository.js';
import { matchesStatusFilter, withEffectiveStatus } from '../utils/invitationStatus.js';

const SELECT_COLUMNS = `
  id,
  recipient_name,
  recipient_email,
  role_type,
  subject,
  message,
  invitation_token,
  status,
  expires_at,
  created_by,
  sent_at,
  accepted_at,
  created_at,
  updated_at
`;

let storageMode = null; // 'database' | 'file'
let storageWarningLogged = false;

function isTableMissingError(error) {
  const msg = String(error?.message || '');
  return (
    error?.code === '42P01' ||
    msg.includes('admin_invitations') ||
    msg.includes('does not exist') ||
    msg.includes('schema cache')
  );
}

async function probeStorage() {
  if (storageMode) return storageMode;

  const { error } = await supabaseAdmin.from('admin_invitations').select('id').limit(1);
  if (!error) {
    storageMode = 'database';
    return storageMode;
  }

  if (isTableMissingError(error)) {
    storageMode = 'file';
    if (!storageWarningLogged) {
      storageWarningLogged = true;
      logger.warn(
        'admin_invitations table missing — using local file storage (backend/data/admin-invitations.json). Run scripts/admin-invitations.sql in Supabase SQL Editor for permanent storage.',
      );
    }
    return storageMode;
  }

  throw error;
}

async function repo() {
  const mode = await probeStorage();
  return mode === 'database' ? supabaseDbRepository : adminInvitationFileRepository;
}

export function getInvitationStorageMode() {
  return storageMode;
}

const supabaseDbRepository = {
  async create(payload) {
    const { data, error } = await supabaseAdmin
      .from('admin_invitations')
      .insert(payload)
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw error;
    return data;
  },

  async findById(id) {
    const { data, error } = await supabaseAdmin
      .from('admin_invitations')
      .select(SELECT_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async findByToken(token) {
    const { data, error } = await supabaseAdmin
      .from('admin_invitations')
      .select(SELECT_COLUMNS)
      .eq('invitation_token', token)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async findActiveByEmail(email, roleType) {
    const { data, error } = await supabaseAdmin
      .from('admin_invitations')
      .select(SELECT_COLUMNS)
      .eq('recipient_email', email)
      .eq('role_type', roleType)
      .in('status', ['draft', 'sent', 'pending'])
      .gt('expires_at', new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async list(opts) {
    const { page = 1, limit = 10, search = '', status = null, roleType = null } = opts;

    let query = supabaseAdmin
      .from('admin_invitations')
      .select(SELECT_COLUMNS)
      .order('created_at', { ascending: false });

    if (roleType) query = query.eq('role_type', roleType);
    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`recipient_email.ilike.${term},recipient_name.ilike.${term}`);
    }

    const { data, error } = await query;
    if (error) throw error;

    let rows = (data ?? []).map(withEffectiveStatus);
    if (status) rows = rows.filter((row) => matchesStatusFilter(row, status));

    const total = rows.length;
    const from = (page - 1) * limit;
    const items = rows.slice(from, from + limit);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  async update(id, updates) {
    const { data, error } = await supabaseAdmin
      .from('admin_invitations')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await supabaseAdmin.from('admin_invitations').delete().eq('id', id);
    if (error) throw error;
    return true;
  },

  async expireStale() {
    const { error } = await supabaseAdmin
      .from('admin_invitations')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .in('status', ['draft', 'sent', 'pending'])
      .lt('expires_at', new Date().toISOString());
    if (error) {
      logger.warn('Expire stale invitations skipped', { error: error.message });
    }
  },
};

export const adminInvitationRepository = {
  async create(payload) {
    return (await repo()).create(payload);
  },
  async findById(id) {
    return (await repo()).findById(id);
  },
  async findByToken(token) {
    return (await repo()).findByToken(token);
  },
  async findActiveByEmail(email, roleType) {
    return (await repo()).findActiveByEmail(email, roleType);
  },
  async list(opts) {
    return (await repo()).list(opts);
  },
  async update(id, updates) {
    return (await repo()).update(id, updates);
  },
  async delete(id) {
    return (await repo()).delete(id);
  },
  async expireStale() {
    return (await repo()).expireStale();
  },
};
