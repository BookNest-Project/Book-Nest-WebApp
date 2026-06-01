/** Build human-readable task descriptions for admin activity logs and search. */

function pickString(...values) {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function joinParts(parts) {
  return parts.filter(Boolean).join('\n');
}

function formatReviewTarget(action) {
  const m = action.match(/^(pdf|audio)_review_(.+)$/);
  if (!m) return null;
  const target = m[1] === 'pdf' ? 'PDF' : 'Audio';
  const status = m[2].replace(/_/g, ' ');
  return { target, status };
}

function describeRejectionDetails(d) {
  const lines = [];
  const reason = pickString(d.reason, d.feedback, d.reviewNote);
  if (reason) lines.push(`Reason: ${reason}`);
  if (d.adminNotes) lines.push(`Admin notes: ${d.adminNotes}`);
  if (d.suggestedFixes) lines.push(`Suggested fixes: ${d.suggestedFixes}`);
  if (d.severity) lines.push(`Severity: ${d.severity}`);
  return lines;
}

function describeSettingsPatch(patch) {
  if (!patch || typeof patch !== 'object') return 'Platform settings updated.';
  const lines = [];
  for (const [section, values] of Object.entries(patch)) {
    if (!values || typeof values !== 'object') continue;
    for (const [key, val] of Object.entries(values)) {
      const display =
        typeof val === 'boolean' ? (val ? 'enabled' : 'disabled') : String(val);
      lines.push(`${section}.${key} set to ${display}`);
    }
  }
  return lines.length ? lines.join('\n') : 'Platform settings updated.';
}

function describeReviewStatePatch(patch) {
  if (!patch || typeof patch !== 'object') return 'Review checklist updated.';
  const lines = [];
  if (patch.checklist && typeof patch.checklist === 'object') {
    const checked = Object.entries(patch.checklist)
      .filter(([, v]) => v)
      .map(([k]) => k.replace(/_/g, ' '));
    if (checked.length) lines.push(`Checklist: ${checked.join(', ')}`);
  }
  if (patch.pdfReview) {
    const s = patch.pdfReview.status || 'updated';
    const c = patch.pdfReview.comment;
    lines.push(`PDF review → ${s}${c ? `. Comment: ${c}` : ''}`);
  }
  if (patch.audioReview) {
    const s = patch.audioReview.status || 'updated';
    const c = patch.audioReview.comment;
    lines.push(`Audio review → ${s}${c ? `. Comment: ${c}` : ''}`);
  }
  if (patch.overallNotes) lines.push(`Notes: ${patch.overallNotes}`);
  return lines.length ? lines.join('\n') : 'Review checklist updated.';
}

export function formatTaskDescription(action, details = null) {
  const d = details && typeof details === 'object' ? details : {};
  const title = pickString(d.title, d.bookTitle);
  const titlePart = title ? `"${title}"` : 'this book';

  if (d.description) return d.description;

  switch (action) {
    case 'approved':
      return joinParts([
        `Approved book ${titlePart} for catalog publication.`,
        d.version ? `Version: ${d.version}` : null,
      ]);

    case 'rejected':
      return joinParts([
        `Rejected book ${titlePart}.`,
        ...describeRejectionDetails(d),
      ]);

    case 'approval_removed':
      return joinParts([
        `Removed approval for ${titlePart}.`,
        pickString(d.note, d.reviewNote) || 'Book returned to the review queue.',
      ]);

    case 'changes_requested':
      return joinParts([
        `Requested changes for ${titlePart}.`,
        pickString(d.feedback, d.reason) ? `Feedback: ${pickString(d.feedback, d.reason)}` : null,
      ]);

    case 'submitted_for_review': {
      const kind = d.submissionKind === 'metadata_update' ? 'metadata update' : 'new submission';
      return joinParts([
        `Book ${titlePart} submitted for review (${kind}).`,
        d.updateNote ? `Author note: ${d.updateNote}` : null,
      ]);
    }

    case 'review_state_updated':
      return joinParts([`Updated review workflow for ${titlePart}.`, describeReviewStatePatch(d.patch || d)]);

    case 'update_approved':
      return joinParts([
        `Approved pending update for ${titlePart}.`,
        d.version ? `New version: ${d.version}` : null,
      ]);

    case 'user_banned': {
      const email = d.email ? ` (${d.email})` : '';
      const role = d.role ? `${d.role} ` : '';
      return joinParts([
        `Banned ${role}account${email}.`,
        d.reason ? `Reason: ${d.reason}` : 'No reason provided.',
      ]);
    }

    case 'user_approved': {
      const email = d.email ? ` (${d.email})` : '';
      const role = d.role ? `${d.role} ` : '';
      return `Approved ${role}account${email}. Account is active.`;
    }

    case 'user_status_updated': {
      const email = d.email ? ` (${d.email})` : '';
      return joinParts([
        `Changed account status to "${d.status || 'unknown'}"${email}.`,
        d.reason ? `Reason: ${d.reason}` : null,
      ]);
    }

    case 'settings_updated':
      return describeSettingsPatch(d.patch || d.changes);

    case 'invitation_created':
      return joinParts([
        `Created invitation for ${d.email || 'recipient'} as ${d.role || 'user'}.`,
        d.expiresAt ? `Expires: ${d.expiresAt}` : null,
      ]);

    case 'invitation_sent':
      return `Sent invitation email to ${d.email || 'recipient'} (${d.role || 'role unknown'}).`;

    case 'invitation_deleted':
      return `Deleted invitation for ${d.email || 'recipient'}.`;

    default: {
      const formatReview = formatReviewTarget(action);
      if (formatReview) {
        const comment = pickString(d.comment, d.comments);
        return joinParts([
          `${formatReview.target} review marked as ${formatReview.status} for ${titlePart}.`,
          comment ? `Comment: ${comment}` : null,
        ]);
      }
      if (ACTION_LABELS_FALLBACK[action]) {
        const base = ACTION_LABELS_FALLBACK[action];
        const extra = pickString(d.comment, d.feedback, d.reason, d.note);
        return extra ? `${base}\n${extra}` : base;
      }
      const extra = pickString(d.comment, d.feedback, d.reason, d.note, d.summary);
      return extra || action.replace(/_/g, ' ');
    }
  }
}

const ACTION_LABELS_FALLBACK = {
  approved: 'Approved book',
  rejected: 'Rejected book',
  approval_removed: 'Removed book approval',
  changes_requested: 'Requested book changes',
  submitted_for_review: 'Book submitted for review',
  user_banned: 'Banned user account',
  user_approved: 'Approved user account',
  user_status_updated: 'Updated user status',
  settings_updated: 'Updated platform settings',
};

/** Flatten details for search indexing. */
export function detailsToSearchText(details) {
  if (!details) return '';
  if (typeof details === 'string') return details;
  try {
    return JSON.stringify(details)
      .replace(/[{}"[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}
