import express from 'express';
import { bookController } from '../controllers/bookController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// ============================================
// Public routes (no authentication required)
// ============================================
router.get('/genres', bookController.getGenres);
router.get('/', bookController.getBooks);

// ============================================
// Protected routes (authentication required)
// ============================================
router.use(authenticate);

// ⚠️ IMPORTANT: Specific routes MUST come before parameter routes
router.get('/my-books', bookController.getMyBooks);  // ✅ BEFORE /:id

// Parameter route (catch-all) - MUST be LAST
router.get('/:id', bookController.getBookById);

// Other protected routes
router.post('/', bookController.createBook);
router.put('/:id', bookController.updateBook);
router.delete('/:id', bookController.deleteBook);
router.put('/:id/cover', bookController.updateBookCover);

export default router;