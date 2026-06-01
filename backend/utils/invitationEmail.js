import { sendEmail } from '../services/emailService.js';
import { roleTypeLabel } from './invitationTemplates.js';

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function messageToHtmlParagraphs(message) {
  const safe = escapeHtml(message);
  return safe
    .split(/\n\n+/)
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function buildInvitationAcceptUrl(token) {
  const base =
    process.env.INVITE_ACCEPT_URL ||
    process.env.ADMIN_APP_URL ||
    process.env.FRONTEND_URL ||
    'http://localhost:3001';
  return `${base.replace(/\/+$/, '')}/invite/accept/${token}`;
}

export function buildInvitationEmailHtml({
  recipientName,
  message,
  acceptUrl,
  expiresAt,
  roleType,
}) {
  const expiresLabel = new Date(expiresAt).toLocaleString('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:28px 32px;text-align:center;">
            <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">BookNest</p>
            <p style="margin:8px 0 0;font-size:12px;color:rgba(255,255,255,0.85);text-transform:uppercase;letter-spacing:0.12em;">${escapeHtml(roleTypeLabel(roleType))} Invitation</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#0f172a;">Hello ${escapeHtml(recipientName)},</p>
            ${messageToHtmlParagraphs(message)}
            <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px auto;">
              <tr>
                <td style="border-radius:12px;background:#4f46e5;">
                  <a href="${escapeHtml(acceptUrl)}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Accept invitation</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;color:#64748b;text-align:center;">This invitation expires on <strong>${escapeHtml(expiresLabel)}</strong>.</p>
            <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;text-align:center;word-break:break-all;">Or copy this link:<br><a href="${escapeHtml(acceptUrl)}" style="color:#4f46e5;">${escapeHtml(acceptUrl)}</a></p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:12px;color:#64748b;text-align:center;">Questions? Contact <a href="mailto:support@booknest.app" style="color:#4f46e5;">support@booknest.app</a></p>
            <p style="margin:8px 0 0;font-size:11px;color:#94a3b8;text-align:center;">© ${new Date().getFullYear()} BookNest. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendInvitationEmail(invitation) {
  const recipientEmail = String(invitation.recipient_email || '').trim().toLowerCase();
  const acceptUrl = buildInvitationAcceptUrl(invitation.invitation_token);
  const html = buildInvitationEmailHtml({
    recipientName: invitation.recipient_name,
    message: invitation.message,
    acceptUrl,
    expiresAt: invitation.expires_at,
    roleType: invitation.role_type,
  });

  const text = [
    `Hello ${invitation.recipient_name},`,
    '',
    invitation.message,
    '',
    `Accept your invitation: ${acceptUrl}`,
    '',
    `This invitation expires on ${new Date(invitation.expires_at).toLocaleString()}.`,
    '',
    '— The BookNest Team',
  ].join('\n');

  const result = await sendEmail({
    to: recipientEmail,
    subject: invitation.subject,
    text,
    html,
  });

  return { ...result, recipientEmail };
}
