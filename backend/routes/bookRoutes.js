import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { 
  createBook, 
  addBookFormat,
  searchAuthors
} from '../controllers/bookController.js';

const router = express.Router();

// Protected routes - only authors and publishers
router.post(
  '/',
  authenticate,
  authorize(['author', 'publisher']),
  createBook
);

router.post(
  '/:bookId/formats',
  authenticate,
  authorize(['author', 'publisher']),
  addBookFormat
);

router.get(
  '/authors/search',  
  searchAuthors
);

export default router;