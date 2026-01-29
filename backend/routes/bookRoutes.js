import express from 'express';
import { 
  createBook,
  getAllBooks,
  getBookById,
  updateBook,
  deleteBook,
  searchAuthors,
  addBookFormat,
  searchBooks,
  getCategories,
  getBooksByCategory,
  getAvailableLanguages,
  advancedSearch,
} from '../controllers/bookController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { bookUpdateSchema } from '../middleware/validation.js';
import { uploadBookFiles, handleUploadError } from '../middleware/upload.js';

const router = express.Router();

router.get('/search', searchBooks);          // This must come BEFORE /:id
router.get('/categories', getCategories);    // This must come BEFORE /:id
router.get('/languages', getAvailableLanguages); // This must come BEFORE /:id
router.get('/category/:categoryId', getBooksByCategory);
// Advanced search (POST - complex filters)
router.post('/search/advanced', advancedSearch);

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

// Get all categories
router.get('/categories', getCategories);

// Get books by category
router.get('/category/:categoryId', getBooksByCategory);

// Get available languages
router.get('/languages', getAvailableLanguages);

// Advanced search (POST - complex filters)
router.post('/search/advanced', advancedSearch);

// Other routes
router.put('/:id', authenticate, validate(bookUpdateSchema), updateBook);
router.delete('/:id', authenticate, deleteBook);
router.post('/:bookId/formats', authenticate, authorize(['author', 'publisher']), addBookFormat);

export default router;