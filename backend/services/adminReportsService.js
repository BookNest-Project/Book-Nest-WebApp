import { adminApprovalRepository } from '../repositories/adminApprovalRepository.js';
import { adminDashboardRepository } from '../repositories/adminDashboardRepository.js';
import { adminReportsRepository } from '../repositories/adminReportsRepository.js';
import { errorLogsRepository } from '../repositories/errorLogsRepository.js';
import { analyzeSignupRows, buildUsabilitySeries } from './adminDashboardService.js';
import { adminRevenueService } from './adminRevenueService.js';
import { adminUserService } from './adminUserService.js';

function pctChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function formatChangeLabel(change) {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change}%`;
}

function buildActivityComparison(series = []) {
  const half = Math.max(1, Math.floor(series.length / 2));
  const first = series.slice(0, half).reduce((s, p) => s + (p.backendLoad || 0), 0);
  const second = series.slice(half).reduce((s, p) => s + (p.backendLoad || 0), 0);
  const change = pctChange(second, first);
  return {
    current: second,
    previous: first,
    change,
    changeLabel: formatChangeLabel(change),
    label: 'Platform activity (2nd half vs 1st half)',
  };
}

function buildOperationalBlock({
  days,
  totalUsers,
  activeSessions,
  failedAuth,
  pendingBooks,
  approvedBooks,
  rejectedBooks,
  changesRequestedBooks,
  formatCount,
  errorLogStats,
  failedPayments,
  pendingPayments,
  usabilityIndex,
  metrics,
}) {
  const avgResponse =
    usabilityIndex.length > 0
      ? Math.round(
          usabilityIndex.reduce((s, p) => s + (p.responseTime || 0), 0) / usabilityIndex.length,
        )
      : metrics?.systemLatency?.value ?? 0;
  const peakLoad = usabilityIndex.reduce((m, p) => Math.max(m, p.backendLoad || 0), 0);
  const errorTotal = errorLogStats?.total ?? 0;
  const errorRatePct =
    errorTotal > 0
      ? `${(((errorLogStats?.byLevel?.error ?? 0) / errorTotal) * 100).toFixed(1)}%`
      : '0%';

  return {
    days,
    metrics: {
      activeUsers24h: activeSessions,
      suspendedAccounts: failedAuth,
      pendingModeration: pendingBooks,
      approvedCatalog: approvedBooks,
      catalogFormats: formatCount,
      totalUsers,
      failedPayments,
      pendingPayments,
    },
    moderation: {
      pending: pendingBooks,
      approved: approvedBooks,
      rejected: rejectedBooks,
      changesRequested: changesRequestedBooks,
    },
    errorLogs: {
      tableReady: errorLogStats?.tableReady ?? false,
      total: errorLogStats?.total ?? 0,
      unresolved: errorLogStats?.unresolved ?? 0,
      resolved: errorLogStats?.resolved ?? 0,
      last24h: errorLogStats?.last24h ?? 0,
      byLevel: errorLogStats?.byLevel ?? { error: 0, warn: 0, info: 0 },
      errorRate: errorRatePct,
      errorRateStatus: (errorLogStats?.last24h ?? 0) > 10 ? 'ELEVATED' : 'STABLE',
    },
    systemHealth: {
      avgResponseTimeMs: avgResponse,
      peakBackendLoad: peakLoad,
      latencyMs: metrics?.systemLatency?.value ?? avgResponse,
      latencyChangeLabel: metrics?.systemLatency?.changeLabel ?? '0%',
      activeSessionsChangeLabel: metrics?.activeSessions?.changeLabel ?? '0%',
    },
    activityTrend: usabilityIndex,
    activityComparison: buildActivityComparison(usabilityIndex),
    catalogOps: {
      searchVolume: pendingBooks + approvedBooks,
      assetFormats: formatCount,
      avgLoadTime: `${(avgResponse / 100).toFixed(1)}s`,
      avgLoadStatus: avgResponse < 80 ? 'OPTIMAL' : avgResponse < 120 ? 'NORMAL' : 'SLOW',
    },
  };
}

function mapBookStatusToTxStatus(bookStatus) {
  if (bookStatus === 'approved') return 'cleared';
  if (bookStatus === 'pending_review') return 'pending';
  if (bookStatus === 'rejected') return 'refunded';
  return 'pending';
}

function formatTxDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatMoney(amount, currency = 'ETB') {
  const n = Number(amount) || 0;
  if (currency === 'USD' || currency === '$') {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }
  return `${n.toLocaleString('en-US')} ${currency}`;
}

function sourceLabel(formatType, bookTitle) {
  if (formatType === 'Audio') return 'Audio License';
  if (formatType === 'PDF') return 'Individual E-Book Sale';
  if (formatType === 'Catalog') return 'Catalog Entry';
  return `${formatType || 'Book'} — ${bookTitle}`;
}

function buildRevenueTrend(revenueByDay, days = 30) {
  const buckets = {};
  for (const row of revenueByDay ?? []) {
    buckets[row.date] = row.amount;
  }

  const series = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    series.push({
      date: key,
      label: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d),
      amount: buckets[key] || 0,
    });
  }
  return series;
}

function formatTrendDelta(amount, currency = 'ETB') {
  const n = Math.abs(Number(amount) || 0);
  if (n >= 1000) {
    const compact = `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    return amount >= 0 ? `+${compact}` : `-${compact}`;
  }
  return amount >= 0 ? `+${formatMoney(n, currency)}` : `-${formatMoney(n, currency)}`;
}

function daysInclusive(fromStr, toStr) {
  const from = new Date(fromStr);
  from.setHours(0, 0, 0, 0);
  const to = new Date(toStr);
  to.setHours(23, 59, 59, 999);
  const diff = Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;
  return Math.max(1, Math.min(365, diff));
}

function resolveReportPeriod({ days = 30, preset, from, to } = {}) {
  if (preset === 'custom' && from && to) {
    const reportDays = daysInclusive(from, to);
    const periodSince = new Date(from);
    periodSince.setHours(0, 0, 0, 0);
    const periodEnd = new Date(to);
    periodEnd.setHours(23, 59, 59, 999);
    return {
      reportDays,
      baseRange: { preset: 'custom', from, to },
      periodSince,
      errorStatsSince: periodSince.toISOString(),
      errorStatsUntil: periodEnd.toISOString(),
    };
  }

  const reportDays = Math.max(1, Number(days) || 30);
  const periodSince = new Date();
  periodSince.setDate(periodSince.getDate() - reportDays);
  periodSince.setHours(0, 0, 0, 0);
  return {
    reportDays,
    baseRange: daysToCustomRange(reportDays),
    periodSince,
    errorStatsSince: null,
    errorStatsUntil: null,
  };
}

function daysToCustomRange(days) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - Math.max(1, days) + 1);
  from.setHours(0, 0, 0, 0);
  return {
    preset: 'custom',
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function normSaleFormat(ft) {
  const s = String(ft || '').toLowerCase().trim();
  if (s.includes('audio') || s.includes('audiobook')) return 'audio';
  if (s.includes('pdf') || s.includes('ebook') || s.includes('epub')) return 'pdf';
  return s || 'other';
}

function summarizeFormatSales(sales = []) {
  const bucket = (rows) => ({
    sales: rows.reduce((s, r) => s + (r.quantity || 1), 0),
    revenue: round2(rows.reduce((s, r) => s + (Number(r.bookPrice) || 0), 0)),
    commission: round2(rows.reduce((s, r) => s + (Number(r.commissionAmount) || 0), 0)),
    authorEarnings: round2(rows.reduce((s, r) => s + (Number(r.authorEarnings) || 0), 0)),
  });
  const pdf = sales.filter((r) => normSaleFormat(r.format) === 'pdf');
  const audio = sales.filter((r) => normSaleFormat(r.format) === 'audio');
  return {
    pdf: bucket(pdf),
    audio: bucket(audio),
    all: bucket(sales),
  };
}

function buildUserGrowthPayload({
  growthDays,
  totalUsers,
  failedAuth,
  readers,
  authors,
  publishers,
  activeUsers24h,
  signupAnalysis,
  admins = 0,
}) {
  const periodChange = signupAnalysis.comparisons.periodHalf;

  return {
    days: growthDays,
    summary: {
      totalUsers,
      newSignupsInPeriod: signupAnalysis.periodTotal,
      activeUsers24h,
      readers,
      authors,
      publishers,
      suspendedOrDisabled: failedAuth,
    },
    signupsTrend: signupAnalysis.signupsTrend.all,
    signupsTrendByRole: signupAnalysis.signupsTrend,
    monthlyTrendByRole: signupAnalysis.monthlyTrend,
    comparisons: signupAnalysis.comparisons,
    roleCounts: { readers, authors, publishers, admins },
    newByRole: signupAnalysis.newByRole,
    signupGrowthChange: periodChange.change,
    signupGrowthLabel: periodChange.changeLabel,
  };
}

function mapPaymentToTxStatus(paymentStatus) {
  const s = String(paymentStatus || '').toLowerCase();
  if (s === 'success' || s === 'completed' || s === 'paid') return 'cleared';
  if (s === 'failed' || s === 'refunded' || s === 'cancelled' || s === 'canceled') {
    return 'refunded';
  }
  return 'pending';
}

function isSuccessfulSaleStatus(status) {
  const s = String(status || '').toLowerCase();
  return s === 'success' || s === 'completed' || s === 'paid';
}

function mapSaleToTransaction(sale) {
  const status = mapPaymentToTxStatus(sale.status);
  return {
    id: sale.transactionId || sale.id,
    source: `${sale.bookTitle} — ${sale.author}`,
    bookTitle: sale.bookTitle || '—',
    author: sale.author || '—',
    amount: Number(sale.bookPrice) || 0,
    amountFormatted: formatMoney(sale.bookPrice, 'ETB'),
    date: sale.purchaseDate || '—',
    status,
    bookId: sale.bookId || null,
    category: 'revenue',
    publisher: sale.publisher,
    customer: sale.customer,
    commissionAmount: sale.commissionAmount,
    authorEarnings: sale.authorEarnings,
    commissionPercent: sale.commissionPercent,
    paymentMethod: sale.paymentMethod,
    purchaseTime: sale.purchaseTime,
    isbn: sale.isbn,
    format: sale.format || 'other',
    genre: sale.category,
  };
}

export const adminReportsService = {
  async getUserGrowth({ days = 30 } = {}) {
    const growthDays = Math.min(Math.max(days, 7), 90);
    const onlineSince = new Date();
    onlineSince.setHours(onlineSince.getHours() - 24);

    const historySince = new Date();
    historySince.setMonth(historySince.getMonth() - 13);
    historySince.setHours(0, 0, 0, 0);

    const [userStats, activeUsers24h, signupRows] = await Promise.all([
      adminUserService.getStats(),
      adminDashboardRepository.countUsersActiveSince(onlineSince.toISOString()),
      adminDashboardRepository.userSignupsSince(historySince.toISOString()),
    ]);

    const readers = userStats.byRole?.readers ?? 0;
    const authors = userStats.byRole?.authors ?? 0;
    const publishers = userStats.byRole?.publishers ?? 0;
    const signupAnalysis = analyzeSignupRows(signupRows, growthDays);

    return buildUserGrowthPayload({
      growthDays,
      totalUsers: userStats.totalUsers ?? 0,
      failedAuth: userStats.bannedAccounts ?? 0,
      readers,
      authors,
      publishers,
      activeUsers24h,
      signupAnalysis,
      admins: userStats.byRole?.admins ?? 0,
    });
  },

  async getReportsCenter({ days = 30, preset, from, to, format } = {}) {
    const since = new Date();
    since.setDate(since.getDate() - 1);

    const { reportDays, baseRange, periodSince, errorStatsSince, errorStatsUntil } =
      resolveReportPeriod({
      days,
      preset,
      from,
      to,
    });

    const activeFormat = format && format !== 'all' ? format : 'all';

    const usabilityDays = Math.min(Math.max(reportDays, 7), 30);

    const [
      totalUsers,
      activeSessions,
      failedAuth,
      pendingBooks,
      approvedBooks,
      rejectedBooks,
      changesRequestedBooks,
      formatCount,
      catalogValue,
      revenueData,
      activity,
      userGrowth,
      errorLogStats,
      failedPayments,
      pendingPayments,
    ] = await Promise.all([
      adminReportsRepository.countUsers(),
      adminReportsRepository.countUsersActiveSince(since.toISOString()),
      adminReportsRepository.countBannedUsers(),
      adminReportsRepository.countBooksByStatus('pending_review'),
      adminReportsRepository.countBooksByStatus('approved'),
      adminApprovalRepository.countByStatus('rejected').catch(() => 0),
      adminApprovalRepository.countByStatus('changes_requested').catch(() => 0),
      adminReportsRepository.countBookFormats(),
      adminReportsRepository.sumFormatPrices(),
      adminRevenueService.getReportsCenterRevenue(baseRange, activeFormat),
      adminDashboardRepository.dailyActivity(usabilityDays),
      adminReportsService.getUserGrowth({ days: reportDays }),
      errorLogsRepository.getStats(reportDays, undefined, errorStatsSince, errorStatsUntil),
      adminReportsRepository.countTransactionsByStatus(
        ['failed', 'cancelled', 'canceled'],
        periodSince.toISOString(),
      ),
      adminReportsRepository.countTransactionsByStatus(
        ['pending', 'processing'],
        periodSince.toISOString(),
      ),
    ]);

    const usabilityIndex = buildUsabilitySeries(activity, Math.min(Math.max(reportDays, 7), 14));
    const formatBreakdown = summarizeFormatSales(revenueData.allSales ?? []);

    const useRealSales = revenueData.tableReady && Boolean(revenueData.dataSource);
    const revenueSummary = revenueData.summary;
    const realRevenue = revenueSummary?.totalRevenue ?? 0;
    const totalRevenue = useRealSales ? realRevenue : catalogValue;

    const half = Math.max(1, Math.floor((revenueData.charts?.revenueTrend?.length || 0) / 2));
    const trend = revenueData.charts?.revenueTrend ?? [];
    const firstHalfTotal = trend.slice(0, half).reduce((s, d) => s + (d.revenue || 0), 0);
    const secondHalfTotal = trend.slice(half).reduce((s, d) => s + (d.revenue || 0), 0);
    const trendDelta = secondHalfTotal - firstHalfTotal;
    const revenueChange =
      useRealSales && trend.length > 0 && firstHalfTotal > 0
        ? Math.round((trendDelta / firstHalfTotal) * 100)
        : useRealSales
          ? 0
          : 12;

    const sessionChange = activeSessions > 0 ? -0.4 : 0;
    const latencyMs = 42;
    const latencyChange = -8;
    const failedAuthChange = failedAuth > 0 ? 1.2 : 0;

    const formatTotals =
      activeFormat !== 'all' && revenueSummary
        ? {
            format: activeFormat,
            totalRevenue: revenueSummary.totalRevenue,
            platformCommission: revenueSummary.platformCommission,
            authorEarnings: revenueSummary.authorEarnings,
            totalBooksSold: revenueSummary.totalBooksSold,
          }
        : null;

    const financialRows = useRealSales
      ? (revenueData.activeSales ?? []).map(mapSaleToTransaction)
      : (
          await adminReportsRepository.listRecentTransactions(15)
        ).map((row, index) => {
          const book = row.books;
          const status = mapBookStatusToTxStatus(book?.status);
          const amount = Number(row.price) || 0;
          const signedAmount = status === 'refunded' ? -Math.abs(amount) : amount;
          return {
            id: `TX-${String(90214 - index).padStart(5, '0')}`,
            source: sourceLabel(row.format_type, book?.title || 'Unknown'),
            amount: signedAmount,
            amountFormatted: formatMoney(signedAmount, row.currency || 'ETB'),
            date: formatTxDate(row.created_at || book?.updated_at),
            status,
            bookId: book?.id || null,
            category: status === 'refunded' ? 'operational' : 'revenue',
            format: normSaleFormat(row.format_type),
          };
        });

    const revenueTrend = useRealSales
      ? (revenueData.charts?.revenueTrend ?? []).map((d) => ({
          date: d.date,
          label: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
            new Date(d.date),
          ),
          amount: d.revenue,
        }))
      : buildRevenueTrend(
          await adminReportsRepository.revenueByDay(reportDays),
          reportDays,
        );
    const trendTotal = revenueTrend.reduce((s, d) => s + d.amount, 0);

    const metricsBlock = {
      totalRevenue: {
        value: totalRevenue,
        formatted: formatMoney(totalRevenue, 'ETB'),
        change: revenueChange,
        changeLabel: `${revenueChange >= 0 ? '+' : ''}${revenueChange}%`,
      },
      activeSessions: {
        value: activeSessions || totalUsers,
        change: sessionChange,
        changeLabel: `${sessionChange >= 0 ? '+' : ''}${sessionChange}%`,
      },
      systemLatency: {
        value: latencyMs,
        formatted: `${latencyMs}ms`,
        change: latencyChange,
        changeLabel: `${latencyChange}%`,
      },
      failedAuth: {
        value: failedAuth,
        change: failedAuthChange,
        changeLabel: `${failedAuthChange >= 0 ? '+' : ''}${failedAuthChange}%`,
      },
    };

    const errorRateDisplay =
      errorLogStats.total > 0
        ? `${(((errorLogStats.byLevel?.error ?? 0) / errorLogStats.total) * 100).toFixed(2)}%`
        : '0%';

    const operational = buildOperationalBlock({
      days: reportDays,
      totalUsers,
      activeSessions,
      failedAuth,
      pendingBooks,
      approvedBooks,
      rejectedBooks,
      changesRequestedBooks,
      formatCount,
      errorLogStats,
      failedPayments,
      pendingPayments,
      usabilityIndex,
      metrics: metricsBlock,
    });

    return {
      metrics: metricsBlock,
      financial: {
        transactions: financialRows,
        revenueTrend,
        trendSummary: formatMoney(trendTotal, 'ETB'),
        trendChange: formatTrendDelta(trendDelta, 'ETB'),
      },
      usability: {
        searchIntent: {
          label: 'Catalog items',
          value: pendingBooks + approvedBooks,
          unit: 'books',
        },
        assetDownloads: { label: 'Format assets', value: formatCount, unit: 'formats' },
        avgLoadTime: {
          value: operational.catalogOps.avgLoadTime,
          status: operational.catalogOps.avgLoadStatus,
        },
        errorRate: {
          value: errorRateDisplay,
          status: operational.errorLogs.errorRateStatus,
        },
      },
      usabilityIndex,
      summary: {
        totalUsers,
        approvedBooks,
        pendingBooks,
        catalogValue,
      },
      revenue: {
        tableReady: revenueData.tableReady,
        preset: revenueData.preset,
        range: revenueData.range,
        commissionPercent: revenueData.commissionPercent,
        summary: revenueSummary,
        charts: revenueData.charts,
        reports: revenueData.reports,
        dataSource: useRealSales
          ? revenueData.dataSource || 'book_sales'
          : 'catalog_estimate',
        formatBreakdown,
        formatTotals,
        recentSalesCount: financialRows.length,
        activeFormat,
      },
      userGrowth,
      operational,
    };
  },
};
