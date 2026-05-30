import express from 'express';
import {
  validateInvitationToken,
  acceptInvitation,
  redirectToAcceptPage,
} from '../controllers/invitationPublic.js';
import { validate, invitationAcceptSchema } from '../middleware/validation.js';

const router = express.Router();

router.get('/accept/:token/validate', validateInvitationToken);
router.get('/accept/:token', redirectToAcceptPage);
router.post('/accept/:token', validate(invitationAcceptSchema), acceptInvitation);

export default router;
