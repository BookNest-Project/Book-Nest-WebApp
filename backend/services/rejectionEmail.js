import { sendEmail } from './emailService.js';

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Formal rejection notice to the author (plain + HTML).
 */
export async function sendBookRejectionEmail({
  to,
  authorName,
  bookTitle,
  bookId,
  reason,
  adminNotes,
  suggestedFixes,
  severity,
  reviewerName,
  reviewerEmail,
  reviewedAt,
}) {
  const greetingName = authorName?.trim() || 'Author';
  const reviewerLabel =
    reviewerName && reviewerEmail
      ? `${reviewerName} (${reviewerEmail})`
      : reviewerName || reviewerEmail || 'BookNest moderation team';

  const reviewedLabel = reviewedAt
    ? new Date(reviewedAt).toLocaleString('en-US', {
        dateStyle: 'long',
        timeStyle: 'short',
      })
    : new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });

  const subject = `BookNest — "${bookTitle}" was not approved`;

  const text = [
    `Dear ${greetingName},`,
    '',
    `Thank you for submitting your work to BookNest. After review, we are unable to approve your book at this time.`,
    '',
    `Book title: ${bookTitle}`,
    `Reference ID: ${bookId}`,
    `Reviewed by: ${reviewerLabel}`,
    `Review date: ${reviewedLabel}`,
    `Severity: ${severity || 'medium'}`,
    '',
    `Your book was rejected because:`,
    reason,
    '',
    adminNotes ? `Additional notes from the reviewer:\n${adminNotes}\n` : '',
    suggestedFixes ? `Suggested improvements:\n${suggestedFixes}\n` : '',
    'You may revise your manuscript and resubmit it from your Studio dashboard when ready.',
    '',
    'Warm regards,',
    'The BookNest Team',
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Georgia, 'Times New Roman', serif; color: #1a2a3a; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 24px;">
  <p>Dear ${escapeHtml(greetingName)},</p>
  <p>Thank you for submitting your work to <strong>BookNest</strong>. After careful review, we are unable to approve your book at this time.</p>
  <table style="width:100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
    <tr><td style="padding:8px; border:1px solid #e8e2d9; background:#f5f1eb;"><strong>Book title</strong></td><td style="padding:8px; border:1px solid #e8e2d9;">${escapeHtml(bookTitle)}</td></tr>
    <tr><td style="padding:8px; border:1px solid #e8e2d9; background:#f5f1eb;"><strong>Reference ID</strong></td><td style="padding:8px; border:1px solid #e8e2d9;">${escapeHtml(bookId)}</td></tr>
    <tr><td style="padding:8px; border:1px solid #e8e2d9; background:#f5f1eb;"><strong>Reviewed by</strong></td><td style="padding:8px; border:1px solid #e8e2d9;">${escapeHtml(reviewerLabel)}</td></tr>
    <tr><td style="padding:8px; border:1px solid #e8e2d9; background:#f5f1eb;"><strong>Review date</strong></td><td style="padding:8px; border:1px solid #e8e2d9;">${escapeHtml(reviewedLabel)}</td></tr>
    <tr><td style="padding:8px; border:1px solid #e8e2d9; background:#f5f1eb;"><strong>Severity</strong></td><td style="padding:8px; border:1px solid #e8e2d9;">${escapeHtml(severity || 'medium')}</td></tr>
  </table>
  <p style="color:#b85c38; font-weight:bold;">Your book was rejected because:</p>
  <blockquote style="margin:12px 0; padding:12px 16px; border-left:4px solid #b85c38; background:#fef2f2;">${escapeHtml(reason).replace(/\n/g, '<br>')}</blockquote>
  ${adminNotes ? `<p><strong>Additional notes:</strong><br>${escapeHtml(adminNotes).replace(/\n/g, '<br>')}</p>` : ''}
  ${suggestedFixes ? `<p><strong>Suggested improvements:</strong><br>${escapeHtml(suggestedFixes).replace(/\n/g, '<br>')}</p>` : ''}
  <p>You may revise your manuscript and resubmit from your <strong>Studio</strong> dashboard when ready.</p>
  <p style="margin-top:32px;">Warm regards,<br><strong>The BookNest Team</strong></p>
</body>
</html>`;

  return sendEmail({ to, subject, text, html });
}
