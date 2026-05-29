import express from 'express';
import { bookController } from '../controllers/bookController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// ============================================
// Public routes (no authentication required)
// ============================================
router.get('/genres', bookController.getGenres);
router.get('/languages', bookController.getLanguages);
router.get('/', bookController.getBooks);

// ============================================
// Protected routes (authentication required)
// ============================================
router.get('/personalized', authenticate, bookController.getPersonalizedBooks);
router.get('/my-books', authenticate, bookController.getMyBooks);
router.get('/:id/edit', authenticate, bookController.getBookForEdit);
router.post('/:id/submit', authenticate, bookController.submitBookForReview);

// Parameter route (catch-all) - MUST be LAST

// Other protected routes
router.post('/', authenticate, bookController.createBook);
router.put('/:id', authenticate, bookController.updateBook);
router.delete('/:id', authenticate, bookController.deleteBook);
router.put('/:id/cover', authenticate, bookController.updateBookCover); 
router.get('/formats/:id', authenticate, bookController.getBookFormatById);

router.get('/:id', bookController.getBookById);

export default router;