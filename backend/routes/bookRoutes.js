import express from 'express';
import { 
  createBook,
  getAllBooks,
  getBookById,
  updateBook,
  deleteBook,
  searchAuthors,
  addBookFormat
} from '../controllers/bookController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { bookSchema, bookFormatSchema } from '../middleware/validation.js';

const router = express.Router();

// Public routes (no authentication required)
router.get('/', getAllBooks);           // GET /api/books
router.get('/search/authors', searchAuthors);  // GET /api/books/search/authors?q=name
router.get('/:id', getBookById);        // GET /api/books/:id

// Protected routes (require authentication)
router.post('/', 
  authenticate, 
  authorize(['author', 'publisher', 'admin']),  // Only authors/publishers/admins
  validate(bookSchema), 
  createBook
);

router.put('/:id', 
  authenticate, 
  validate(bookSchema), 
  updateBook
);

router.delete('/:id', 
  authenticate, 
  deleteBook
);

// Book formats (PDF/Audio)
router.post('/:bookId/formats', 
  authenticate, 
  authorize(['author', 'publisher', 'admin']),
  validate(bookFormatSchema),
  addBookFormat
);

export default router;