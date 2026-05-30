export const INVITATION_STATUS_LABELS = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  expired: 'Expired',
};

function normalizeRawStatus(status) {
  if (status === 'pending') return 'draft';
  return status;
}

/** Resolved status for display and filtering. */
export function effectiveInvitationStatus(row) {
  if (!row) return 'draft';
  const raw = normalizeRawStatus(row.status);
  if (raw === 'accepted') return 'accepted';
  if (raw === 'expired' || new Date(row.expires_at) < new Date()) return 'expired';
  if (raw === 'sent' || row.sent_at) return 'sent';
  return 'draft';
}

export function matchesStatusFilter(row, status) {
  if (!status) return true;
  return effectiveInvitationStatus(row) === status;
}

export function withEffectiveStatus(row) {
  if (!row) return row;
  return { ...row, status: effectiveInvitationStatus(row) };
}
