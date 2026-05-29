import express from 'express';
import { upload } from '../middleware/upload.js';
import { uploadController } from '../controllers/uploadController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Make sure authenticate is applied BEFORE upload
router.use(authenticate);

const bookUploadFields = upload.fields([
  { name: 'cover', maxCount: 1 },
  { name: 'pdf', maxCount: 1 },
  { name: 'audio', maxCount: 1 },
]);

router.post('/books/upload', bookUploadFields, uploadController.uploadBook);
router.put('/books/:id/upload', bookUploadFields, uploadController.updateUploadedBook);
router.post('/books/:id/formats', bookUploadFields, uploadController.addBookFormat);

export default router;