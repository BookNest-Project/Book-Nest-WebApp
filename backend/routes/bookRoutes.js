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
import { bookSchema, bookUpdateSchema } from '../middleware/validation.js';
import { uploadBookFiles, handleUploadError } from '../middleware/upload.js';

const router = express.Router();

// Public routes
router.get('/', getAllBooks);
router.get('/search/authors', searchAuthors);
router.get('/:id', getBookById);

// Create book with file uploads
router.post('/', 
  authenticate, 
  authorize(['author', 'publisher']), // Only authors & publishers
  uploadBookFiles,          // Handle file uploads
  handleUploadError,        // Handle upload errors
  createBook                // Our main controller
);

// Other routes
router.put('/:id', authenticate, validate(bookUpdateSchema), updateBook);
router.delete('/:id', authenticate, deleteBook);
router.post('/:bookId/formats', authenticate, authorize(['author', 'publisher']), addBookFormat);

export default router;