import express from 'express';
import { upload } from '../middleware/upload.js';
import { uploadController } from '../controllers/uploadController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.post(
  '/books/upload',
  upload.fields([
    { name: 'cover', maxCount: 1 },
    { name: 'pdf', maxCount: 1 },
    { name: 'audio', maxCount: 1 },
  ]),
  uploadController.uploadBook
);

export default router;