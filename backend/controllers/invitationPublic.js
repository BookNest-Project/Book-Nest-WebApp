import { formatSuccess } from '../utils/responseFormatter.js';
import { adminInvitationService } from '../services/adminInvitationService.js';
import { buildInvitationAcceptUrl } from '../utils/invitationEmail.js';

export const validateInvitationToken = async (req, res, next) => {
  try {
    const token = req.params.token;
    const data = await adminInvitationService.validateToken(token);
    res.status(200).json(
      formatSuccess({
        ...data,
        acceptPath: `/invite/accept/${token}`,
      }),
    );
  } catch (error) {
    next(error);
  }
};

export const acceptInvitation = async (req, res, next) => {
  try {
    const token = req.params.token;
    const { password, displayName } = req.body;
    const data = await adminInvitationService.acceptInvitation(token, {
      password,
      displayName,
    });
    res.status(200).json(formatSuccess(data, 'Account created successfully'));
  } catch (error) {
    next(error);
  }
};

export const redirectToAcceptPage = async (req, res) => {
  const token = req.params.token;
  const url = buildInvitationAcceptUrl(token);
  res.redirect(302, url);
};
