import express from 'express';
import { chatController } from '../controllers/chatController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/', chatController.getUserChats);
router.post('/direct', chatController.getOrCreateDirectChat);
router.post('/join/:token', chatController.joinGroupViaInvite);

router.post('/groups', chatController.createGroupChat);
router.post('/groups/:chatId/members', chatController.addGroupMember);
router.post('/groups/:chatId/invite', chatController.createGroupInvite);
router.delete('/groups/:chatId/members/:memberId', chatController.removeGroupMember);
router.delete('/groups/:chatId', chatController.deleteGroup);
router.delete('/groups/:chatId/leave', chatController.leaveGroup);

router.delete('/direct/:chatId', chatController.deleteDirectChat);

router.delete('/messages/:messageId/me', chatController.deleteMessageForMe);
router.delete('/messages/:messageId/everyone', chatController.deleteMessageForEveryone);
router.patch('/messages/:messageId', chatController.editMessage);

router.get('/:chatId/members', chatController.getGroupMembers);
router.get('/:chatId', chatController.getChatById);
router.get('/:chatId/messages', chatController.getChatMessages);
router.post('/:chatId/messages', chatController.sendMessage);

export default router;
