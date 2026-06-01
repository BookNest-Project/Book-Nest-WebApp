import { adminTasksRepository } from '../repositories/adminTasksRepository.js';
import {
  formatTaskDescription,
  detailsToSearchText,
} from '../utils/adminTaskDescriptions.js';

function formatActionLabel(action) {
  const short = formatTaskDescription(action, null);
  if (short && short.length < 80) return short.split('\n')[0];
  return action.replace(/_/g, ' ');
}

function formatAdminName(userInfo) {
  if (!userInfo) return 'System';
  const name = userInfo.displayName?.trim();
  if (name) return name;
  if (userInfo.email) return userInfo.email.split('@')[0];
  return 'Admin';
}

function matchesSearch(
  { action, summary, description, category, details },
  bookTitle,
  adminName,
  targetEmail,
  q,
) {
  const hay = [
    action,
    summary,
    description,
    formatActionLabel(action),
    bookTitle,
    adminName,
    targetEmail,
    category,
    detailsToSearchText(details),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

export const adminTasksService = {
  async listRecentTasks({ search = '', page = 1, limit = 15 } = {}) {
    const [bookRows, taskRows] = await Promise.all([
      adminTasksRepository.listBookReviewActivity(400),
      adminTasksRepository.listAdminTasks(400),
    ]);

    const taskKeys = new Set(
      taskRows.map((t) => `${t.bookId || ''}|${t.action}|${t.createdAt}`),
    );
    const legacyBookRows = bookRows.filter(
      (b) => !taskKeys.has(`${b.bookId || ''}|${b.action}|${b.createdAt}`),
    );

    const merged = [...legacyBookRows, ...taskRows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const bookIds = [...new Set(merged.map((t) => t.bookId).filter(Boolean))];
    const userIds = [
      ...new Set(
        merged.flatMap((t) => [t.adminId, t.targetUserId].filter(Boolean)),
      ),
    ];

    const [bookMap, userMap] = await Promise.all([
      adminTasksRepository.fetchBooksByIds(bookIds),
      adminTasksRepository.fetchUsersByIds(userIds),
    ]);

    const q = search.trim().toLowerCase();

    let items = merged.map((task) => {
      const bookTitle = task.bookId ? bookMap.get(task.bookId) || 'Unknown book' : null;
      const adminInfo = task.adminId ? userMap.get(task.adminId) : null;
      const targetInfo = task.targetUserId ? userMap.get(task.targetUserId) : null;
      const adminName = formatAdminName(adminInfo);
      const description =
        task.summary ||
        (task.details?.description) ||
        formatTaskDescription(task.action, task.details);
      const label = description.split('\n')[0];

      return {
        id: `${task.source}-${task.id}`,
        action: task.action,
        label,
        description,
        category: task.category,
        createdAt: task.createdAt,
        adminId: task.adminId,
        adminName,
        adminEmail: adminInfo?.email ?? null,
        bookId: task.bookId,
        bookTitle,
        targetUserId: task.targetUserId,
        targetUserEmail: targetInfo?.email ?? null,
        details: task.details,
      };
    });

    if (q) {
      items = items.filter((task) =>
        matchesSearch(
          {
            action: task.action,
            summary: task.label,
            description: task.description,
            category: task.category,
            details: task.details,
          },
          task.bookTitle,
          task.adminName,
          task.targetUserEmail,
          q,
        ),
      );
    }

    const total = items.length;
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const offset = (safePage - 1) * safeLimit;
    const pageItems = items.slice(offset, offset + safeLimit);

    return {
      items: pageItems,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      },
    };
  },
};
