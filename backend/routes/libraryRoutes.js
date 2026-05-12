import express from 'express';
import { libraryController } from '../controllers/libraryController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/', libraryController.getLibrary);
router.get('/check/:bookFormatId', libraryController.checkPurchase);

export default router;