import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { adminInvitationRepository, getInvitationStorageMode } from '../repositories/adminInvitationRepository.js';
import { adminUserBulkService } from './adminUserBulkService.js';
import {
  applyTemplatePlaceholders,
  getDefaultTemplate,
  roleTypeLabel,
  roleTypeToAppRole,
} from '../utils/invitationTemplates.js';
import { sendInvitationEmail } from '../utils/invitationEmail.js';
import {
  sanitizeInvitationSubject,
  sanitizeInvitationText,
} from '../utils/sanitizeInvitation.js';
import { effectiveInvitationStatus, withEffectiveStatus } from '../utils/invitationStatus.js';
import { logger } from '../utils/logger.js';
import { recordAdminTask } from '../utils/adminTaskLogger.js';

function formatInvitation(row, emailMeta = null) {
  if (!row) return null;
  const item = {
    id: row.id,
    recipientName: row.recipient_name,
    recipientEmail: row.recipient_email,
    roleType: row.role_type,
    roleLabel: roleTypeLabel(row.role_type),
    subject: row.subject,
    message: row.message,
    invitationToken: row.invitation_token,
    status: row.status,
    expiresAt: row.expires_at,
    createdBy: row.created_by,
    sentAt: row.sent_at,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acceptUrl: null,
  };
  if (emailMeta?.sent) {
    item.lastEmailSentTo = emailMeta.to || row.recipient_email;
  }
  return item;
}

function emailSendError(emailResult) {
  if (emailResult.message) return emailResult.message;
  if (emailResult.reason === 'not_configured') {
    return 'Email is not configured. Add SMTP_HOST, SMTP_USER, and SMTP_PASS to backend/.env.';
  }
  if (emailResult.reason === 'smtp_auth_missing') {
    return (
      'Gmail App Password missing. In backend/.env set SMTP_PASS to your 16-character Google App Password ' +
      '(Google Account → Security → 2-Step Verification → App passwords), then restart the backend.'
    );
  }
  if (emailResult.reason === 'invalid_recipient') {
    return 'Recipient email address is invalid.';
  }
  if (emailResult.realDelivery === false && emailResult.sent) {
    return 'Email was not delivered to a real inbox. Configure Gmail SMTP_PASS in backend/.env.';
  }
  return `Failed to send email to ${emailResult.recipientEmail || emailResult.to || 'recipient'}: ${emailResult.reason}`;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function ensureNotExpired(row) {
  if (!row) return null;
  if (row.status === 'accepted') return row;
  if (new Date(row.expires_at) < new Date()) {
    if (row.status !== 'expired') {
      await adminInvitationRepository.update(row.id, { status: 'expired' });
      return { ...row, status: 'expired' };
    }
  }
  return row;
}

async function findUserByEmail(email) {
  const { data } = await supabaseAdmin
    .from('users')
    .select('id, email, role')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();
  return data;
}

export const adminInvitationService = {
  getTemplate(roleType) {
    const template = getDefaultTemplate(roleType);
    return {
      roleType: roleType || 'user',
      subject: template.subject,
      message: template.message,
    };
  },

  previewTemplate({ roleType, recipientName, subject, message, expiresAt }) {
    const template = getDefaultTemplate(roleType);
    return {
      subject: sanitizeInvitationSubject(subject || template.subject),
      message: applyTemplatePlaceholders(
        sanitizeInvitationText(message || template.message),
        { name: recipientName, expiresAt },
      ),
    };
  },

  async listInvitations(query) {
    await adminInvitationRepository.expireStale();
    const result = await adminInvitationRepository.list(query);
    return {
      items: result.items.map((row) => {
        const normalized = withEffectiveStatus(row);
        const item = formatInvitation(normalized);
        if (item.status === 'sent' || item.status === 'draft') {
          item.acceptUrl = null;
        }
        return item;
      }),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
      storage: getInvitationStorageMode() || 'database',
    };
  },

  async getInvitation(id) {
    await adminInvitationRepository.expireStale();
    const row = await ensureNotExpired(await adminInvitationRepository.findById(id));
    if (!row) {
      const err = new Error('Invitation not found');
      err.statusCode = 404;
      throw err;
    }
    return formatInvitation(withEffectiveStatus(row));
  },

  async createInvitation(payload, adminId) {
    await adminInvitationRepository.expireStale();

    const email = payload.recipientEmail.trim().toLowerCase();
    const roleType = payload.roleType;
    const expiresAt = new Date(payload.expiresAt);

    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      const err = new Error('Expiration must be in the future');
      err.statusCode = 400;
      throw err;
    }

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      const err = new Error('A user with this email already exists');
      err.statusCode = 409;
      throw err;
    }

    const active = await adminInvitationRepository.findActiveByEmail(email, roleType);
    if (active) {
      const err = new Error('An active invitation already exists for this email and role');
      err.statusCode = 409;
      throw err;
    }

    const defaults = getDefaultTemplate(roleType);
    const subject = sanitizeInvitationSubject(payload.subject || defaults.subject);
    const message = sanitizeInvitationText(
      applyTemplatePlaceholders(payload.message || defaults.message, {
        name: payload.recipientName,
        expiresAt: expiresAt.toISOString(),
      }),
    );

    const row = await adminInvitationRepository.create({
      recipient_name: payload.recipientName.trim(),
      recipient_email: email,
      role_type: roleType,
      subject,
      message,
      invitation_token: generateToken(),
      status: 'draft',
      expires_at: expiresAt.toISOString(),
      created_by: adminId,
    });

    const formatted = formatInvitation(row);

    await recordAdminTask({
      adminId,
      category: 'invitations',
      action: 'invitation_created',
      details: {
        email,
        role: roleType,
        recipientName: payload.recipientName.trim(),
        expiresAt: expiresAt.toISOString(),
        subject,
      },
    });

    if (payload.sendImmediately !== false) {
      try {
        return await this.sendInvitation(row.id, adminId);
      } catch (sendErr) {
        if (sendErr.statusCode === 503) {
          logger.warn('Invitation saved; email not sent', {
            id: row.id,
            email: row.recipient_email,
            reason: sendErr.message,
          });
          return {
            ...formatted,
            emailSendFailed: true,
            emailError: sendErr.message,
          };
        }
        throw sendErr;
      }
    }

    return formatted;
  },

  async sendInvitation(id, adminId) {
    await adminInvitationRepository.expireStale();
    let row = await adminInvitationRepository.findById(id);
    row = await ensureNotExpired(row);

    if (!row) {
      const err = new Error('Invitation not found');
      err.statusCode = 404;
      throw err;
    }
    if (row.status === 'accepted') {
      const err = new Error('Invitation was already accepted');
      err.statusCode = 400;
      throw err;
    }

    const effective = effectiveInvitationStatus(row);
    if (effective === 'expired') {
      const err = new Error('Invitation has expired. Use Resend to renew and send again.');
      err.statusCode = 400;
      throw err;
    }

    const emailResult = await sendInvitationEmail(row);
    if (!emailResult.sent || !emailResult.realDelivery) {
      const err = new Error(emailSendError(emailResult));
      err.statusCode = 503;
      throw err;
    }

    const updated = await adminInvitationRepository.update(id, {
      status: 'sent',
      sent_at: new Date().toISOString(),
    });

    logger.info('Invitation email sent to recipient', {
      id,
      adminId,
      to: emailResult.recipientEmail || row.recipient_email,
    });

    await recordAdminTask({
      adminId,
      category: 'invitations',
      action: 'invitation_sent',
      details: {
        email: row.recipient_email,
        role: row.role_type,
        recipientName: row.recipient_name,
        invitationId: id,
      },
    });

    return formatInvitation(updated, emailResult);
  },

  async resendInvitation(id, adminId) {
    const row = await adminInvitationRepository.findById(id);
    if (!row) {
      const err = new Error('Invitation not found');
      err.statusCode = 404;
      throw err;
    }
    if (row.status === 'accepted') {
      const err = new Error('Cannot resend an accepted invitation');
      err.statusCode = 400;
      throw err;
    }

    const newExpires =
      new Date(row.expires_at) > new Date()
        ? row.expires_at
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const updates = {
      expires_at: newExpires,
      invitation_token: generateToken(),
    };

    if (effectiveInvitationStatus(row) === 'expired') {
      updates.status = 'draft';
    }

    await adminInvitationRepository.update(id, updates);

    return this.sendInvitation(id, adminId);
  },

  async updateInvitation(id, payload) {
    const row = await adminInvitationRepository.findById(id);
    if (!row) {
      const err = new Error('Invitation not found');
      err.statusCode = 404;
      throw err;
    }
    if (row.status === 'accepted') {
      const err = new Error('Accepted invitations cannot be edited');
      err.statusCode = 400;
      throw err;
    }

    const effective = effectiveInvitationStatus(row);
    if (effective !== 'draft' && effective !== 'expired') {
      const err = new Error('Only draft or expired invitations can be edited');
      err.statusCode = 400;
      throw err;
    }

    const updates = {};

    if (payload.recipientName !== undefined) {
      const name = payload.recipientName.trim();
      if (name.length < 2) {
        const err = new Error('Recipient name must be at least 2 characters');
        err.statusCode = 400;
        throw err;
      }
      updates.recipient_name = name;
    }

    if (payload.subject !== undefined) {
      updates.subject = sanitizeInvitationSubject(payload.subject);
    }

    if (payload.message !== undefined) {
      const name = updates.recipient_name || row.recipient_name;
      const expiresAt = payload.expiresAt || row.expires_at;
      updates.message = sanitizeInvitationText(
        applyTemplatePlaceholders(payload.message, { name, expiresAt }),
      );
    }

    if (payload.roleType !== undefined) {
      if (!['user', 'author', 'publisher'].includes(payload.roleType)) {
        const err = new Error('Invalid role type');
        err.statusCode = 400;
        throw err;
      }
      updates.role_type = payload.roleType;
    }

    if (payload.expiresAt !== undefined) {
      const expiresAt = new Date(payload.expiresAt);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
        const err = new Error('Expiration must be in the future');
        err.statusCode = 400;
        throw err;
      }
      updates.expires_at = expiresAt.toISOString();
      if (effective === 'expired') {
        updates.status = 'draft';
      }
    }

    if (Object.keys(updates).length === 0) {
      const err = new Error('No changes provided');
      err.statusCode = 400;
      throw err;
    }

    const updated = await adminInvitationRepository.update(id, updates);
    return formatInvitation(withEffectiveStatus(updated));
  },

  async deleteInvitation(id, adminId = null) {
    const row = await adminInvitationRepository.findById(id);
    if (!row) {
      const err = new Error('Invitation not found');
      err.statusCode = 404;
      throw err;
    }
    await adminInvitationRepository.delete(id);

    if (adminId) {
      await recordAdminTask({
        adminId,
        category: 'invitations',
        action: 'invitation_deleted',
        details: {
          email: row.recipient_email,
          role: row.role_type,
          recipientName: row.recipient_name,
          invitationId: id,
          status: row.status,
        },
      });
    }

    return { deleted: true };
  },

  async validateToken(token) {
    await adminInvitationRepository.expireStale();
    const row = await ensureNotExpired(await adminInvitationRepository.findByToken(token));

    if (!row) {
      const err = new Error('Invalid invitation link');
      err.statusCode = 404;
      throw err;
    }
    if (row.status === 'accepted') {
      const err = new Error('This invitation has already been accepted');
      err.statusCode = 410;
      throw err;
    }
    if (row.status === 'expired' || new Date(row.expires_at) < new Date()) {
      const err = new Error('This invitation has expired');
      err.statusCode = 410;
      throw err;
    }
    const effective = effectiveInvitationStatus(row);
    if (effective === 'draft') {
      const err = new Error('This invitation has not been sent yet');
      err.statusCode = 400;
      throw err;
    }
    if (effective !== 'sent') {
      const err = new Error('Invitation is not available');
      err.statusCode = 400;
      throw err;
    }

    return {
      recipientName: row.recipient_name,
      recipientEmail: row.recipient_email,
      roleType: row.role_type,
      roleLabel: roleTypeLabel(row.role_type),
      expiresAt: row.expires_at,
      appRole: roleTypeToAppRole(row.role_type),
    };
  },

  async acceptInvitation(token, { password, displayName }) {
    await adminInvitationRepository.expireStale();
    const row = await adminInvitationRepository.findByToken(token);
    const valid = await this.validateToken(token);

    const existingUser = await findUserByEmail(row.recipient_email);
    if (existingUser) {
      const err = new Error('An account with this email already exists. Please sign in.');
      err.statusCode = 409;
      throw err;
    }

    const appRole = roleTypeToAppRole(row.role_type);
    const name = (displayName || row.recipient_name).trim();

    const summary = await adminUserBulkService.processBulkRows(
      [
        {
          email: row.recipient_email,
          action: 'create',
          role: appRole,
          name,
          password,
          account_status: 'active',
        },
      ],
      row.created_by,
    );

    if (summary.failed > 0) {
      const message = summary.results[0]?.message || 'Failed to create account';
      const err = new Error(message);
      err.statusCode = message.includes('already') ? 409 : 400;
      throw err;
    }

    await adminInvitationRepository.update(row.id, {
      status: 'accepted',
      accepted_at: new Date().toISOString(),
    });

    logger.info('Invitation accepted', { id: row.id, email: row.recipient_email });

    return {
      email: row.recipient_email,
      role: appRole,
      roleType: row.role_type,
      recipientName: valid.recipientName,
    };
  },
};
