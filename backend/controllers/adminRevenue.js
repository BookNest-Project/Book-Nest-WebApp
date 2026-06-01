import { adminRevenueService } from '../services/adminRevenueService.js';

function pickFilters(query) {
  return {
    preset: query.preset,
    from: query.from,
    to: query.to,
    search: query.search || query.q,
    bookTitle: query.bookTitle,
    isbn: query.isbn,
    category: query.category,
    language: query.language,
    format: query.format,
    authorName: query.authorName,
    authorId: query.authorId,
    publisher: query.publisher,
    paymentMethod: query.paymentMethod,
    paymentStatus: query.paymentStatus,
    revenueSort: query.revenueSort,
    page: query.page,
    limit: query.limit,
  };
}

export async function getRevenueDashboard(req, res, next) {
  try {
    const data = await adminRevenueService.getDashboard(pickFilters(req.query));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function listRevenueSales(req, res, next) {
  try {
    const data = await adminRevenueService.listSales(pickFilters(req.query));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getRevenueSettings(req, res, next) {
  try {
    const data = await adminRevenueService.getSettings();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateRevenueSettings(req, res, next) {
  try {
    const { commissionPercent } = req.body;
    if (commissionPercent === undefined || commissionPercent === null) {
      return res.status(400).json({
        success: false,
        error: { message: 'commissionPercent is required' },
      });
    }
    const data = await adminRevenueService.updateSettings(
      { commissionPercent },
      req.user?.id,
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function exportRevenueSales(req, res, next) {
  try {
    const data = await adminRevenueService.exportRows(pickFilters(req.query));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
