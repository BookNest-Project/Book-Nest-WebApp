import express from 'express';
import { profileController } from '../controllers/profileController.js';

const router = express.Router();

router.get('/profile/:username', profileController.getPublicProfile);

export default router;