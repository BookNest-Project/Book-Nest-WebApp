import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { matchesStatusFilter, withEffectiveStatus } from '../utils/invitationStatus.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.resolve(__dirname, '../data/admin-invitations.json');

async function readAll() {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : [];
    let changed = false;
    const normalized = rows.map((row) => {
      const next = normalizeLegacyRow(row);
      if (next.status !== row.status) changed = true;
      return next;
    });
    if (changed) await writeAll(normalized);
    return normalized;
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeAll(rows) {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(rows, null, 2), 'utf8');
}

function nowIso() {
  return new Date().toISOString();
}

function matchesSearch(row, search) {
  if (!search?.trim()) return true;
  const term = search.trim().toLowerCase();
  return (
    row.recipient_email?.toLowerCase().includes(term) ||
    row.recipient_name?.toLowerCase().includes(term)
  );
}

function normalizeLegacyRow(row) {
  if (row.status === 'pending' && !row.sent_at) {
    return { ...row, status: 'draft' };
  }
  if (row.status === 'pending' && row.sent_at) {
    return { ...row, status: 'sent' };
  }
  return row;
}

export const adminInvitationFileRepository = {
  async create(payload) {
    const rows = await readAll();
    const row = normalizeLegacyRow({
      id: crypto.randomUUID(),
      ...payload,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
    rows.unshift(row);
    await writeAll(rows);
    return row;
  },

  async findById(id) {
    const rows = await readAll();
    return rows.find((r) => r.id === id) ?? null;
  },

  async findByToken(token) {
    const rows = await readAll();
    return rows.find((r) => r.invitation_token === token) ?? null;
  },

  async findActiveByEmail(email, roleType) {
    const rows = await readAll();
    const now = nowIso();
    return (
      rows.find(
        (r) =>
          r.recipient_email === email &&
          r.role_type === roleType &&
          ['draft', 'sent', 'pending'].includes(r.status) &&
          r.expires_at > now,
      ) ?? null
    );
  },

  async list({ page = 1, limit = 10, search = '', status = null, roleType = null }) {
    let rows = (await readAll()).map(normalizeLegacyRow);
    if (roleType) rows = rows.filter((r) => r.role_type === roleType);
    if (search?.trim()) rows = rows.filter((r) => matchesSearch(r, search));
    rows = rows.map(withEffectiveStatus);
    if (status) rows = rows.filter((r) => matchesStatusFilter(r, status));

    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
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
    const rows = await readAll();
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    rows[idx] = { ...rows[idx], ...updates, updated_at: nowIso() };
    await writeAll(rows);
    return rows[idx];
  },

  async delete(id) {
    const rows = await readAll();
    const next = rows.filter((r) => r.id !== id);
    if (next.length === rows.length) return false;
    await writeAll(next);
    return true;
  },

  async expireStale() {
    const rows = await readAll();
    const now = nowIso();
    let changed = false;
    for (const row of rows) {
      if (['draft', 'sent', 'pending'].includes(row.status) && row.expires_at < now) {
        row.status = 'expired';
        row.updated_at = now;
        changed = true;
      }
    }
    if (changed) await writeAll(rows);
  },
};
