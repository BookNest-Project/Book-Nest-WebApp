import { adminRevenueRepository } from '../repositories/adminRevenueRepository.js';
import { platformSettingsRepository } from '../repositories/platformSettingsRepository.js';

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function toIso(d) {
  return d instanceof Date ? d.toISOString() : d;
}

export function resolveDatePreset(preset, customFrom, customTo) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  switch (preset) {
    case 'today':
      return { from: toIso(todayStart), to: toIso(todayEnd) };
    case 'yesterday': {
      const y = new Date(todayStart);
      y.setDate(y.getDate() - 1);
      return { from: toIso(startOfDay(y)), to: toIso(endOfDay(y)) };
    }
    case 'this_week': {
      const d = new Date(todayStart);
      const day = d.getDay();
      const diff = day === 0 ? 6 : day - 1;
      d.setDate(d.getDate() - diff);
      return { from: toIso(startOfDay(d)), to: toIso(todayEnd) };
    }
    case 'last_week': {
      const end = new Date(todayStart);
      end.setDate(end.getDate() - (end.getDay() === 0 ? 7 : end.getDay()));
      end.setMilliseconds(-1);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      return { from: toIso(startOfDay(start)), to: toIso(end) };
    }
    case 'this_month': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toIso(startOfDay(s)), to: toIso(todayEnd) };
    }
    case 'last_month': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toIso(startOfDay(s)), to: toIso(endOfDay(e)) };
    }
    case 'this_year': {
      const s = new Date(now.getFullYear(), 0, 1);
      return { from: toIso(startOfDay(s)), to: toIso(todayEnd) };
    }
    case 'custom':
      return {
        from: customFrom ? toIso(startOfDay(new Date(customFrom))) : null,
        to: customTo ? toIso(endOfDay(new Date(customTo))) : null,
      };
    default:
      return { from: null, to: null };
  }
}

function normFormat(ft) {
  const s = String(ft || '').toLowerCase().trim();
  if (s.includes('audio') || s.includes('audiobook')) return 'audio';
  if (s.includes('pdf') || s.includes('ebook') || s.includes('epub')) return 'pdf';
  return s || 'other';
}

function needsFullRangeFetch(query = {}) {
  return Boolean(
    query.search ||
      query.bookTitle ||
      query.revenueSort ||
      (query.format && query.format !== 'both' && query.format !== 'all'),
  );
}

function isSuccessfulSaleStatus(status) {
  const s = String(status || '').toLowerCase();
  return s === 'success' || s === 'completed' || s === 'paid';
}

function buyerLabel(sale) {
  return sale._buyerName || sale.buyer_id?.slice(0, 8) || '—';
}

function mapSaleRow(sale, defaultCommission) {
  const book = sale.books || {};
  const payment = sale.payments || {};
  const genre = book.genres || {};
  const fmt = sale.book_formats?.format_type || sale.format_type;
  const rate = Number(sale.commission_rate);
  const commissionPct = Number.isFinite(rate) ? rate : defaultCommission;
  const price = Number(sale.sale_price) || 0;
  let commission = Number(sale.platform_commission);
  let authorEarn = Number(sale.seller_earnings);
  if (!Number.isFinite(commission) || commission <= 0) {
    commission = Math.round(price * (commissionPct / 100) * 100) / 100;
  }
  if (!Number.isFinite(authorEarn) || authorEarn <= 0) {
    authorEarn = Math.round((price - commission) * 100) / 100;
  }
  const saleDate = sale.sale_date ? new Date(sale.sale_date) : null;

  return {
    id: sale.id,
    bookId: sale.book_id,
    bookCover: book.cover_image_url || null,
    bookTitle: book.title || '—',
    author: book.author_name || '—',
    authorId: book.author_user_id || sale.seller_id,
    publisher: book.publisher_name || '—',
    category: genre.name || '—',
    customer: buyerLabel(sale),
    customerId: sale.buyer_id,
    purchaseDate: saleDate ? saleDate.toISOString().slice(0, 10) : null,
    purchaseTime: saleDate ? saleDate.toISOString().slice(11, 19) : null,
    quantity: sale.quantity || 1,
    bookPrice: price,
    commissionPercent: commissionPct,
    commissionAmount: commission,
    authorEarnings: authorEarn,
    paymentMethod: payment.payment_method || '—',
    transactionId: payment.tx_ref || payment.id || '—',
    status: payment.status || 'success',
    isbn: book.isbn || '',
    language: book.language || '',
    format: normFormat(fmt),
    genreId: book.genre_id,
  };
}

function applyFilters(rows, filters = {}) {
  let out = [...rows];

  if (filters.bookTitle) {
    const q = filters.bookTitle.toLowerCase();
    out = out.filter((r) => r.bookTitle.toLowerCase().includes(q));
  }
  if (filters.isbn) {
    const q = filters.isbn.toLowerCase();
    out = out.filter((r) => (r.isbn || '').toLowerCase().includes(q));
  }
  if (filters.category) {
    const q = filters.category.toLowerCase();
    out = out.filter((r) => r.category.toLowerCase().includes(q));
  }
  if (filters.language) {
    const q = filters.language.toLowerCase();
    out = out.filter((r) => (r.language || '').toLowerCase().includes(q));
  }
  if (filters.format && filters.format !== 'both' && filters.format !== 'all') {
    out = out.filter((r) => normFormat(r.format) === filters.format);
  }
  if (filters.authorName) {
    const q = filters.authorName.toLowerCase();
    out = out.filter((r) => r.author.toLowerCase().includes(q));
  }
  if (filters.authorId) {
    out = out.filter((r) => r.authorId === filters.authorId);
  }
  if (filters.publisher) {
    const q = filters.publisher.toLowerCase();
    out = out.filter((r) => r.publisher.toLowerCase().includes(q));
  }
  if (filters.paymentMethod) {
    out = out.filter((r) => r.paymentMethod === filters.paymentMethod);
  }
  if (filters.paymentStatus) {
    out = out.filter((r) => r.status === filters.paymentStatus);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    out = out.filter(
      (r) =>
        r.bookTitle.toLowerCase().includes(q) ||
        r.author.toLowerCase().includes(q) ||
        r.publisher.toLowerCase().includes(q) ||
        r.customer.toLowerCase().includes(q) ||
        r.transactionId.toLowerCase().includes(q) ||
        (r.isbn || '').toLowerCase().includes(q),
    );
  }

  const sort = filters.revenueSort;
  if (sort === 'highest_revenue') out.sort((a, b) => b.bookPrice - a.bookPrice);
  else if (sort === 'lowest_revenue') out.sort((a, b) => a.bookPrice - b.bookPrice);
  else if (sort === 'highest_commission') out.sort((a, b) => b.commissionAmount - a.commissionAmount);
  else if (sort === 'lowest_commission') out.sort((a, b) => a.commissionAmount - b.commissionAmount);

  return out;
}

function summarize(rows) {
  const revenue = rows.reduce((s, r) => s + r.bookPrice, 0);
  const commission = rows.reduce((s, r) => s + r.commissionAmount, 0);
  const authorEarnings = rows.reduce((s, r) => s + r.authorEarnings, 0);
  const booksSold = rows.reduce((s, r) => s + (r.quantity || 1), 0);
  const customers = new Set(rows.map((r) => r.customerId).filter(Boolean)).size;
  const authors = new Set(rows.map((r) => r.authorId).filter(Boolean)).size;

  return {
    totalRevenue: round2(revenue),
    platformCommission: round2(commission),
    authorEarnings: round2(authorEarnings),
    totalBooksSold: booksSold,
    totalCustomers: customers,
    activeAuthors: authors,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function groupByPeriod(rows, period) {
  const buckets = new Map();

  for (const r of rows) {
    if (!r.purchaseDate) continue;
    const d = new Date(r.purchaseDate + (r.purchaseTime ? `T${r.purchaseTime}Z` : ''));
    let key;
    let label;

    if (period === 'daily') {
      key = r.purchaseDate;
      label = r.purchaseDate;
    } else if (period === 'weekly') {
      const w = getWeekKey(d);
      key = w.key;
      label = w.label;
    } else if (period === 'monthly') {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      label = key;
    } else if (period === 'yearly') {
      key = String(d.getFullYear());
      label = key;
    } else continue;

    if (!buckets.has(key)) {
      buckets.set(key, { period: label, booksSold: 0, revenue: 0, commission: 0, authorEarnings: 0 });
    }
    const b = buckets.get(key);
    b.booksSold += r.quantity || 1;
    b.revenue += r.bookPrice;
    b.commission += r.commissionAmount;
    b.authorEarnings += r.authorEarnings;
  }

  return [...buckets.values()]
    .map((b) => ({
      period: b.period,
      booksSold: b.booksSold,
      revenue: round2(b.revenue),
      commission: round2(b.commission),
      authorEarnings: round2(b.authorEarnings),
    }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

function getWeekKey(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return { key: `${date.getUTCFullYear()}-W${weekNo}`, label: `Week ${weekNo}, ${date.getUTCFullYear()}` };
}

function chartData(rows) {
  const trend = groupByPeriod(rows, 'daily').map((b) => ({
    date: b.period,
    revenue: b.revenue,
    commission: b.commission,
    authorEarnings: b.authorEarnings,
  }));

  const totalRev = rows.reduce((s, r) => s + r.bookPrice, 0);
  const totalComm = rows.reduce((s, r) => s + r.commissionAmount, 0);
  const totalAuthor = rows.reduce((s, r) => s + r.authorEarnings, 0);

  const bookMap = new Map();
  const authorMap = new Map();
  for (const r of rows) {
    bookMap.set(r.bookId, (bookMap.get(r.bookId) || 0) + (r.quantity || 1));
    const aid = r.authorId || r.author;
    authorMap.set(aid, {
      name: r.author,
      revenue: (authorMap.get(aid)?.revenue || 0) + r.bookPrice,
      sales: (authorMap.get(aid)?.sales || 0) + (r.quantity || 1),
    });
  }

  const topBooks = [...bookMap.entries()]
    .map(([bookId, count]) => {
      const sample = rows.find((r) => r.bookId === bookId);
      return { bookId, title: sample?.bookTitle || bookId, sold: count };
    })
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 10);

  const topAuthors = [...authorMap.values()]
    .map((a) => ({ name: a.name, revenue: round2(a.revenue), sales: a.sales }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return {
    revenueTrend: trend,
    commissionDistribution: [
      { name: 'Platform', value: round2(totalComm) },
      { name: 'Authors', value: round2(totalAuthor) },
    ],
    topBooks,
    topAuthors,
    totals: { revenue: round2(totalRev), commission: round2(totalComm), author: round2(totalAuthor) },
  };
}

async function enrichBuyerNames(rawRows) {
  const buyerIds = [
    ...new Set(rawRows.map((r) => r.buyer_id || r.user_id).filter(Boolean)),
  ];
  if (buyerIds.length === 0) return rawRows;

  const { supabaseAdmin } = await import('../config/supabase.js');
  const [{ data: readers }, { data: users }] = await Promise.all([
    supabaseAdmin.from('reader_profiles').select('user_id, display_name').in('user_id', buyerIds),
    supabaseAdmin.from('users').select('id, email').in('id', buyerIds),
  ]);

  const nameById = new Map();
  for (const u of users || []) nameById.set(u.id, u.email);
  for (const r of readers || []) nameById.set(r.user_id, r.display_name);

  return rawRows.map((row) => {
    const buyerId = row.buyer_id || row.user_id;
    return {
      ...row,
      buyer_id: buyerId,
      _buyerName: nameById.get(buyerId) || null,
    };
  });
}

export const adminRevenueService = {
  /**
   * One fetch for reports: split PDF / audio / all from the same purchase rows.
   */
  async getReportsCenterRevenue(baseRange = {}, activeFormat = 'all') {
    const preset = baseRange.preset || 'this_month';
    const { from, to } = resolveDatePreset(preset, baseRange.from, baseRange.to);
    const defaultCommission = await platformSettingsRepository.getCommissionPercent();

    const { rows: raw, tableReady, source } =
      await adminRevenueRepository.fetchAllSuccessfulSalesInRange({
        from,
        to,
        commissionPercent: defaultCommission,
      });

    if (!tableReady) {
      return {
        tableReady: false,
        dataSource: null,
        preset,
        range: { from, to },
        commissionPercent: defaultCommission,
        activeFormat,
        allSales: [],
        activeSales: [],
        summary: null,
        charts: null,
        reports: null,
      };
    }

    const enriched = await enrichBuyerNames(raw);
    const allSales = enriched
      .map((s) => mapSaleRow(s, defaultCommission))
      .filter((s) => isSuccessfulSaleStatus(s.status));

    const activeSales =
      activeFormat === 'pdf'
        ? allSales.filter((s) => s.format === 'pdf')
        : activeFormat === 'audio'
          ? allSales.filter((s) => s.format === 'audio')
          : allSales;

    const summary = summarize(activeSales);
    const charts = chartData(activeSales);

    return {
      tableReady: true,
      dataSource: source,
      preset,
      range: { from, to },
      commissionPercent: defaultCommission,
      activeFormat,
      allSales,
      activeSales,
      summary,
      charts,
      reports: {
        daily: groupByPeriod(activeSales, 'daily'),
        weekly: groupByPeriod(activeSales, 'weekly'),
        monthly: groupByPeriod(activeSales, 'monthly'),
        yearly: groupByPeriod(activeSales, 'yearly'),
      },
    };
  },

  async getDashboard(query = {}) {
    const preset = query.preset || 'this_month';
    const { from, to } = resolveDatePreset(preset, query.from, query.to);
    const defaultCommission = await platformSettingsRepository.getCommissionPercent();

    const { rows: raw, tableReady, source } =
      await adminRevenueRepository.fetchAllSuccessfulSalesInRange({
        from,
        to,
        commissionPercent: defaultCommission,
      });
    const enriched = await enrichBuyerNames(raw);
    const mapped = enriched.map((s) => mapSaleRow(s, defaultCommission));
    const filtered = applyFilters(mapped, query);
    const summary = summarize(filtered);
    const charts = chartData(filtered);

    return {
      tableReady,
      dataSource: source,
      preset,
      range: { from, to },
      commissionPercent: defaultCommission,
      summary,
      charts,
      reports: {
        daily: groupByPeriod(filtered, 'daily'),
        weekly: groupByPeriod(filtered, 'weekly'),
        monthly: groupByPeriod(filtered, 'monthly'),
        yearly: groupByPeriod(filtered, 'yearly'),
      },
    };
  },

  async listSales(query = {}) {
    const preset = query.preset;
    const range =
      preset && preset !== 'all'
        ? resolveDatePreset(preset, query.from, query.to)
        : { from: query.from || null, to: query.to || null };

    const defaultCommission = await platformSettingsRepository.getCommissionPercent();
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 25));
    const mustFetchFullRange =
      needsFullRangeFetch(query) ||
      (query.format && query.format !== 'both' && query.format !== 'all');

    if (mustFetchFullRange) {
      const { rows: raw, tableReady, source } =
        await adminRevenueRepository.fetchAllSuccessfulSalesInRange({
          ...range,
          commissionPercent: defaultCommission,
        });
      const enriched = await enrichBuyerNames(raw);
      let mapped = enriched.map((s) => mapSaleRow(s, defaultCommission));
      mapped = applyFilters(mapped, query);
      const total = mapped.length;
      const start = (page - 1) * limit;
      return {
        tableReady,
        dataSource: source,
        range,
        commissionPercent: defaultCommission,
        summary: summarize(mapped),
        sales: mapped.slice(start, start + limit),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
      };
    }

    const { rows: raw, total, tableReady, source } =
      await adminRevenueRepository.listSuccessfulSales({
        ...range,
        page,
        limit,
        commissionPercent: defaultCommission,
      });
    const enriched = await enrichBuyerNames(raw);
    let sales = enriched.map((s) => mapSaleRow(s, defaultCommission));
    sales = applyFilters(sales, query);
    const filteredTotal = sales.length;
    const start = (page - 1) * limit;

    return {
      tableReady,
      dataSource: source,
      range,
      commissionPercent: defaultCommission,
      summary: summarize(sales),
      sales: sales.slice(start, start + limit),
      pagination: {
        page,
        limit,
        total: filteredTotal,
        pages: Math.ceil(filteredTotal / limit) || 1,
      },
    };
  },

  async getSettings() {
    const commissionPercent = await platformSettingsRepository.getCommissionPercent();
    return { commissionPercent };
  },

  async updateSettings({ commissionPercent }, adminId) {
    const result = await platformSettingsRepository.setCommissionPercent(commissionPercent, adminId);
    const { recordAdminTask } = await import('../utils/adminTaskLogger.js');
    await recordAdminTask({
      adminId,
      category: 'settings',
      action: 'settings_updated',
      details: {
        patch: { revenue: { commission_percent: commissionPercent } },
      },
    });
    return result;
  },

  exportRows(query = {}) {
    return this.listSales({ ...query, page: 1, limit: 10000 });
  },
};
