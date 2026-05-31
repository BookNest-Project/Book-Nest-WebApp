/** User is online if last_seen_at is within this window (ms). */
export const ONLINE_THRESHOLD_MS = 3 * 60 * 1000;

export function isUserOnline(lastSeenAt) {
  if (!lastSeenAt) return false;
  const ts = new Date(lastSeenAt).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < ONLINE_THRESHOLD_MS;
}
