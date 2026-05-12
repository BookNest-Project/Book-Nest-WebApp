import express from 'express';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/feed', (req, res) => {
  res.status(501).json({ success: false, error: { message: 'Community feed not implemented yet' } });
});

router.use(authenticate);

router.post('/posts', (req, res) => {
  res.status(501).json({ success: false, error: { message: 'Posting not implemented yet' } });
});

export default router;

