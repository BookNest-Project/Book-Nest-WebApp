import express from 'express';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/me', (req, res) => {
  res.status(501).json({ success: false, error: { message: 'Gamification not implemented yet' } });
});

router.post('/progress', (req, res) => {
  res.status(501).json({ success: false, error: { message: 'Progress tracking not implemented yet' } });
});

export default router;

