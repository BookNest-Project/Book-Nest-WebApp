import { adminTasksRepository } from '../repositories/adminTasksRepository.js';
import { formatTaskDescription } from './adminTaskDescriptions.js';

/**
 * Record an admin (or author submission) task with a full text description.
 */
export async function recordAdminTask({
  adminId,
  category,
  action,
  bookId = null,
  targetUserId = null,
  details = null,
  description = null,
}) {
  const summary = description || formatTaskDescription(action, details);
  const enrichedDetails = {
    ...(details && typeof details === 'object' ? details : {}),
    description: summary,
    action,
  };

  await adminTasksRepository.logTask({
    adminId,
    category,
    action,
    summary,
    bookId,
    targetUserId,
    details: enrichedDetails,
  });

  return summary;
}
