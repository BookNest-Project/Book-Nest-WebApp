import { errorLogsRepository } from '../repositories/errorLogsRepository.js';
import { NotFoundError } from '../utils/errors.js';

function formatLogDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function mapRow(row) {
  return {
    id: row.id,
    level: row.level,
    message: row.message,
    code: row.code,
    statusCode: row.status_code,
    path: row.path,
    method: row.method,
    userId: row.user_id,
    stack: row.stack,
    metadata: row.metadata,
    resolved: row.resolved,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    createdAt: row.created_at,
    createdAtFormatted: formatLogDate(row.created_at),
  };
}

function periodFromQuery(query = {}) {
  if (query.from && query.to) {
    const from = new Date(query.from);
    from.setHours(0, 0, 0, 0);
    const to = new Date(query.to);
    to.setHours(23, 59, 59, 999);
    const days = Math.max(1, Math.min(365, Math.floor((to - from) / 86400000) + 1));
    return { days, sinceIso: from.toISOString(), untilIso: to.toISOString() };
  }
  return {
    days: parseInt(query.days, 10) || 30,
    sinceIso: null,
    untilIso: null,
  };
}

export const adminErrorLogsService = {
  async list(query = {}) {
    const page = parseInt(query.page, 10) || 1;
    const limit = parseInt(query.limit, 10) || 25;
    const hours = query.hours ? parseInt(query.hours, 10) : undefined;
    const period = periodFromQuery(query);

    const [listResult, stats] = await Promise.all([
      errorLogsRepository.list({
        page,
        limit,
        level: query.level,
        search: query.search,
        resolved: query.resolved,
        days: period.days,
        hours,
        sinceIso: period.sinceIso,
        untilIso: period.untilIso,
      }),
      errorLogsRepository.getStats(period.days, hours, period.sinceIso, period.untilIso),
    ]);

    const total = listResult.total;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const errorRate =
      stats.total > 0
        ? `${((stats.byLevel.error / stats.total) * 100).toFixed(1)}%`
        : '0%';

    return {
      tableReady: listResult.tableReady && stats.tableReady,
      items: (listResult.items || []).map(mapRow),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
      stats: {
        ...stats,
        errorRate,
        errorRateStatus: stats.last24h > 10 ? 'ELEVATED' : 'STABLE',
      },
    };
  },

  async export(query = {}) {
    const hours = query.hours ? parseInt(query.hours, 10) : undefined;
    const period = periodFromQuery(query);
    const result = await errorLogsRepository.list({
      page: 1,
      limit: 2000,
      level: query.level,
      search: query.search,
      resolved: query.resolved,
      days: period.days,
      hours,
      sinceIso: period.sinceIso,
      untilIso: period.untilIso,
    });

    return {
      tableReady: result.tableReady,
      items: (result.items || []).map(mapRow),
      total: result.total,
      exported: (result.items || []).length,
    };
  },

  async resolve(logId, adminId) {
    const row = await errorLogsRepository.markResolved(logId, adminId);
    if (!row) throw new NotFoundError('Error log not found');
    return mapRow(row);
  },

  async unresolve(logId) {
    const row = await errorLogsRepository.markUnresolved(logId);
    if (!row) throw new NotFoundError('Error log not found');
    return mapRow(row);
  },

  async recordFromRequest(err, req, statusCode) {
    return errorLogsRepository.log({
      level: statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info',
      message: err?.message || 'Unknown error',
      code: err?.errorCode || err?.code || null,
      statusCode,
      path: req?.originalUrl || req?.path,
      method: req?.method,
      userId: req?.user?.id,
      stack: process.env.NODE_ENV === 'development' ? err?.stack : undefined,
      metadata: {
        query: req?.query,
        ip: req?.ip,
      },
    });
  },
};
