import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

function tableMissing(error) {
  const msg = error?.message || '';
  return (
    msg.includes('system_error_logs') ||
    msg.includes('does not exist') ||
    error?.code === '42P01'
  );
}

let tableAvailable = null;

async function hasTable() {
  if (tableAvailable !== null) return tableAvailable;
  const { error } = await supabaseAdmin.from('system_error_logs').select('id').limit(1);
  tableAvailable = !tableMissing(error);
  if (!tableAvailable) {
    logger.warn(
      'system_error_logs table missing — run backend/scripts/admin-error-logs.sql in Supabase',
    );
  }
  return tableAvailable;
}

export const errorLogsRepository = {
  async log(entry) {
    if (!(await hasTable())) return null;

    const row = {
      level: entry.level || 'error',
      message: String(entry.message || 'Unknown error').slice(0, 2000),
      code: entry.code || null,
      status_code: entry.statusCode ?? entry.status_code ?? null,
      path: entry.path || null,
      method: entry.method || null,
      user_id: entry.userId ?? entry.user_id ?? null,
      stack: entry.stack ? String(entry.stack).slice(0, 8000) : null,
      metadata: entry.metadata ?? null,
    };

    const { data, error } = await supabaseAdmin
      .from('system_error_logs')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      if (!tableMissing(error)) logger.warn('errorLogsRepository.log', { error: error.message });
      return null;
    }
    return data?.id ?? null;
  },

  async list({
    page = 1,
    limit = 25,
    level,
    search,
    resolved,
    days = 30,
    hours,
    sinceIso = null,
    untilIso = null,
  } = {}) {
    if (!(await hasTable())) {
      return { items: [], total: 0, tableReady: false };
    }

    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const rangeFrom = (Math.max(page, 1) - 1) * safeLimit;
    const rangeTo = rangeFrom + safeLimit - 1;

    const since = new Date();
    if (sinceIso) {
      since.setTime(new Date(sinceIso).getTime());
    } else if (hours) {
      since.setTime(Date.now() - Math.max(1, Number(hours)) * 60 * 60 * 1000);
    } else {
      since.setDate(since.getDate() - Math.max(1, days));
    }

    let query = supabaseAdmin
      .from('system_error_logs')
      .select('*', { count: 'exact' })
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false });

    if (untilIso) {
      query = query.lte('created_at', untilIso);
    }

    if (level && level !== 'all') {
      query = query.eq('level', level);
    }
    if (resolved === 'true' || resolved === true) {
      query = query.eq('resolved', true);
    } else if (resolved === 'false' || resolved === false) {
      query = query.eq('resolved', false);
    }
    if (search?.trim()) {
      const term = search.trim().replace(/[%_]/g, '');
      query = query.or(
        `message.ilike.%${term}%,path.ilike.%${term}%,code.ilike.%${term}%,method.ilike.%${term}%`,
      );
    }

    const { data, error, count } = await query.range(rangeFrom, rangeTo);

    if (error) {
      if (tableMissing(error)) return { items: [], total: 0, tableReady: false };
      throw error;
    }

    return {
      items: data || [],
      total: count ?? 0,
      tableReady: true,
    };
  },

  async getStats(days = 30, hours, sinceIso = null, untilIso = null) {
    if (!(await hasTable())) {
      return {
        tableReady: false,
        total: 0,
        unresolved: 0,
        resolved: 0,
        byLevel: { error: 0, warn: 0, info: 0 },
        byLevelUnresolved: { error: 0, warn: 0, info: 0 },
        last24h: 0,
      };
    }

    const since = new Date();
    if (sinceIso) {
      since.setTime(new Date(sinceIso).getTime());
    } else if (hours) {
      since.setTime(Date.now() - Math.max(1, Number(hours)) * 60 * 60 * 1000);
    } else {
      since.setDate(since.getDate() - Math.max(1, days));
    }
    const sinceFilter = since.toISOString();
    const untilFilter = untilIso || null;
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    let statsQuery = supabaseAdmin
      .from('system_error_logs')
      .select('level, resolved, created_at')
      .gte('created_at', sinceFilter);

    if (untilFilter) {
      statsQuery = statsQuery.lte('created_at', untilFilter);
    }

    const { data, error } = await statsQuery;

    if (error) {
      if (tableMissing(error)) {
        return {
          tableReady: false,
          total: 0,
          unresolved: 0,
          resolved: 0,
          byLevel: { error: 0, warn: 0, info: 0 },
          byLevelUnresolved: { error: 0, warn: 0, info: 0 },
          last24h: 0,
        };
      }
      throw error;
    }

    const rows = data || [];
    const byLevel = { error: 0, warn: 0, info: 0 };
    const byLevelUnresolved = { error: 0, warn: 0, info: 0 };
    let unresolved = 0;
    let last24h = 0;

    for (const row of rows) {
      if (byLevel[row.level] !== undefined) byLevel[row.level] += 1;
      if (!row.resolved) {
        unresolved += 1;
        if (byLevelUnresolved[row.level] !== undefined) {
          byLevelUnresolved[row.level] += 1;
        }
      }
      if (row.created_at >= dayAgo) last24h += 1;
    }

    return {
      tableReady: true,
      total: rows.length,
      unresolved,
      resolved: rows.length - unresolved,
      byLevel,
      byLevelUnresolved,
      last24h,
    };
  },

  async markUnresolved(id) {
    if (!(await hasTable())) return null;

    const { data, error } = await supabaseAdmin
      .from('system_error_logs')
      .update({
        resolved: false,
        resolved_at: null,
        resolved_by: null,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  async markResolved(id, adminId) {
    if (!(await hasTable())) return null;

    const { data, error } = await supabaseAdmin
      .from('system_error_logs')
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: adminId,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },
};
