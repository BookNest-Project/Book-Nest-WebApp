import express from 'express';
import {
  addBookFormat,
  advancedSearch,
  createBook,
  deleteBook,
  getAllBooks,
  getAvailableLanguages,
  getBookById,
  getBooksByCategory,
  getCategories,
  searchAuthors,
  searchBooks,
  updateBook
} from '../controllers/bookController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { bookUpdateSchema, validate } from '../middleware/validation.js';
import { handleUploadError, uploadBookFiles } from '../middleware/upload.js';

const router = express.Router();

router.get('/search', searchBooks);
router.get('/search/authors', searchAuthors);
router.post('/search/advanced', advancedSearch);
router.get('/categories', getCategories);
router.get('/languages', getAvailableLanguages);
router.get('/category/:categoryId', getBooksByCategory);
router.get('/', getAllBooks);
router.get('/:id', getBookById);

router.post(
  '/',
  authenticate,
  authorize(['author', 'publisher', 'admin']),
  uploadBookFiles,
  handleUploadError,
  createBook
);

router.put('/:id', authenticate, validate(bookUpdateSchema), updateBook);
router.delete('/:id', authenticate, deleteBook);
router.post('/:bookId/formats', authenticate, authorize(['author', 'publisher', 'admin']), addBookFormat);

export default router;
