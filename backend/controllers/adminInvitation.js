import { formatSuccess } from '../utils/responseFormatter.js';
import { adminInvitationService } from '../services/adminInvitationService.js';

export const getInvitationTemplates = async (req, res, next) => {
  try {
    const roleType = req.query.roleType || req.query.role_type || 'user';
    const data = adminInvitationService.getTemplate(roleType);
    res.status(200).json(formatSuccess(data));
  } catch (error) {
    next(error);
  }
};

export const previewInvitation = async (req, res, next) => {
  try {
    const data = adminInvitationService.previewTemplate(req.body);
    res.status(200).json(formatSuccess(data));
  } catch (error) {
    next(error);
  }
};

export const listInvitations = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = req.query.search || req.query.q || '';
    const status = req.query.status || null;
    const roleType = req.query.roleType || req.query.role_type || null;

    const data = await adminInvitationService.listInvitations({
      page,
      limit,
      search,
      status,
      roleType,
    });
    res.status(200).json(formatSuccess(data, 'Invitations retrieved'));
  } catch (error) {
    next(error);
  }
};

export const getInvitation = async (req, res, next) => {
  try {
    const data = await adminInvitationService.getInvitation(req.params.id);
    res.status(200).json(formatSuccess(data));
  } catch (error) {
    next(error);
  }
};

export const createInvitation = async (req, res, next) => {
  try {
    const data = await adminInvitationService.createInvitation(req.body, req.user.id);
    const sendNow = req.body.sendImmediately !== false;
    let msg;
    if (data?.emailSendFailed) {
      msg = data.emailError || 'Invitation saved but email could not be sent.';
    } else if (sendNow && data?.status === 'sent') {
      msg = `Invitation email sent to ${data.recipientEmail}`;
    } else {
      msg = `Invitation saved as draft. Use Send to email ${data.recipientEmail}.`;
    }
    res.status(201).json(formatSuccess(data, msg));
  } catch (error) {
    next(error);
  }
};

export const sendInvitation = async (req, res, next) => {
  try {
    const data = await adminInvitationService.sendInvitation(req.params.id, req.user.id);
    res.status(200).json(
      formatSuccess(data, `Invitation email sent to ${data.recipientEmail}`),
    );
  } catch (error) {
    next(error);
  }
};

export const resendInvitation = async (req, res, next) => {
  try {
    const data = await adminInvitationService.resendInvitation(req.params.id, req.user.id);
    res.status(200).json(
      formatSuccess(data, `Invitation email resent to ${data.recipientEmail}`),
    );
  } catch (error) {
    next(error);
  }
};

export const deleteInvitation = async (req, res, next) => {
  try {
    const data = await adminInvitationService.deleteInvitation(req.params.id, req.user?.id);
    res.status(200).json(formatSuccess(data, 'Invitation deleted'));
  } catch (error) {
    next(error);
  }
};

export const updateInvitation = async (req, res, next) => {
  try {
    const data = await adminInvitationService.updateInvitation(req.params.id, req.body);
    res.status(200).json(formatSuccess(data, 'Invitation updated'));
  } catch (error) {
    next(error);
  }
};
