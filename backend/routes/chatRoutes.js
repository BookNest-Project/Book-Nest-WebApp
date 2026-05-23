import express from 'express';
import { chatController } from '../controllers/chatController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

// Chat list and direct chat
router.get('/', chatController.getUserChats);
router.post('/direct', chatController.getOrCreateDirectChat);

// Group chats
router.post('/groups', chatController.createGroupChat);
router.post('/groups/:chatId/members', chatController.addGroupMember);
router.delete('/groups/:chatId/members/:memberId', chatController.removeGroupMember);

// Messages
router.get('/:chatId/messages', chatController.getChatMessages);
router.post('/:chatId/messages', chatController.sendMessage);

export default router;