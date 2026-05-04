import { bookService } from '../services/bookService.js';
import { validateBookQuery, validateBookId } from '../validators/bookValidator.js';
import { formatSuccess } from '../utils/responseFormatter.js';
import { logger } from '../utils/logger.js';    
 

export const bookController = {

  async getBookById(req, res, next) {
    try {
      const { id } = req.params;
      validateBookId(id);
      
      const userId = req.user?.id;
      const book = await bookService.getBookById(id, userId);
      
      logger.info('Book fetched', { bookId: id, userId: userId || 'guest' });
      
      res.status(200).json(formatSuccess(book, 'Book retrieved successfully'));
    } catch (error) {
      next(error);
    }
  },

  async getGenres(req, res, next) {
    try {
      const genres = await bookService.getGenres();
      
      logger.info('Genres fetched', { count: genres.length });
      
      res.status(200).json(formatSuccess(genres, 'Genres retrieved successfully'));
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get books with filters and pagination
   * GET /api/books
   */
  async getBooks(req, res, next) {
    try {
      validateBookQuery(req.query);
      
      const { genre, format, search, page, limit } = req.query;
      const userId = req.user?.id;
      
      const result = await bookService.getBooks({
        genreId: genre,
        format,
        search,
        page,
        limit,
        userId,
      });
      
      logger.info('Books fetched', { 
        page: result.pagination.page, 
        total: result.pagination.total,
        userId: userId || 'guest'
      });
      
      res.status(200).json(formatSuccess(result, 'Books retrieved successfully'));
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get single book by ID
   * GET /api/books/:id
   */
 async getBookById(req, res, next) {
  try {
    const { id } = req.params;
    
    // Skip validation if it's a special route (though routes should be ordered correctly)
    if (id === 'my-books' || id === 'genres' || id === 'search') {
      return next();
    }
    
    validateBookId(id);
    
    const userId = req.user?.id;
    const book = await bookService.getBookById(id, userId);
    
    res.status(200).json(formatSuccess(book, 'Book retrieved successfully'));
  } catch (error) {
    next(error);
  }
},

  /**
   * Get all genres
   * GET /api/books/genres
   */
  async getGenres(req, res, next) {
    try {
      const genres = await bookService.getGenres();
      
      logger.info('Genres fetched', { count: genres.length });
      
      res.status(200).json(formatSuccess(genres, 'Genres retrieved successfully'));
    } catch (error) {
      next(error);
    }
  },

  // ============================================
  // Protected Methods (Require Authentication)
  // ============================================

  /**
   * Create a new book
   * POST /api/books
   */
  async createBook(req, res, next) {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;
      
      if (userRole !== 'author' && userRole !== 'publisher') {
        return res.status(403).json({ 
          success: false, 
          error: { message: 'Only authors and publishers can upload books' } 
        });
      }

      const bookData = {
        title: req.body.title,
        subtitle: req.body.subtitle,
        description: req.body.description,
        isbn: req.body.isbn,
        language: req.body.language,
        publication_date: req.body.publication_date,
        genre_id: req.body.genre_id,
        author_name: req.body.author_name,
        author_user_id: req.body.author_user_id,
        publisher_name: req.body.publisher_name,
        publisher_user_id: req.body.publisher_user_id,
        cover_image_path: req.body.cover_image_path,
        cover_image_url: req.body.cover_image_url,
        formats: req.body.formats,
      };

      const book = await bookService.createBook(bookData, userId, userRole);

      res.status(201).json(formatSuccess(book, 'Book created successfully'));
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update an existing book
   * PUT /api/books/:id
   */
  async updateBook(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      validateBookId(id);

      const updates = {
        title: req.body.title,
        subtitle: req.body.subtitle,
        description: req.body.description,
        isbn: req.body.isbn,
        language: req.body.language,
        publication_date: req.body.publication_date,
        genre_id: req.body.genre_id,
        author_name: req.body.author_name,
        publisher_name: req.body.publisher_name,
        is_active: req.body.is_active,
      };

      const book = await bookService.updateBook(id, userId, updates);

      res.status(200).json(formatSuccess(book, 'Book updated successfully'));
    } catch (error) {
      next(error);
    }
  },

  /**
   * Delete (soft delete) a book
   * DELETE /api/books/:id
   */
  async deleteBook(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      validateBookId(id);

      await bookService.deleteBook(id, userId);

      res.status(200).json(formatSuccess(null, 'Book deleted successfully'));
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get books uploaded by current user
   * GET /api/books/my-books
   */
  async getMyBooks(req, res, next) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20 } = req.query;

      const result = await bookService.getMyBooks(userId, page, limit);

      res.status(200).json(formatSuccess(result, 'My books retrieved successfully'));
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update book cover
   * PATCH /api/books/:id/cover
   */
  async updateBookCover(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { cover_image_path, cover_image_url } = req.body;

      validateBookId(id);

      if (!cover_image_path || !cover_image_url) {
        return res.status(400).json({ 
          success: false, 
          error: { message: 'Cover image path and URL are required' } 
        });
      }

      await bookService.updateBookCover(id, userId, cover_image_path, cover_image_url);

      res.status(200).json(formatSuccess(null, 'Book cover updated successfully'));
    } catch (error) {
      next(error);
    }
  },


};