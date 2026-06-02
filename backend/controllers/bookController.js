import { bookService } from '../services/bookService.js';
import { bookRepository } from '../repositories/bookRepository.js';
import { validateBookQuery, validateBookId } from '../validators/bookValidator.js';
import { formatSuccess } from '../utils/responseFormatter.js';
import { logger } from '../utils/logger.js';
import { supabaseAdmin } from '../config/supabase.js';


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

  async getLanguages(req, res, next) {
    try {
      const languages = await bookService.getLanguages();
      res.status(200).json(formatSuccess(languages, 'Languages retrieved successfully'));
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

  async getPersonalizedBooks(req, res, next) {
    try {
      const userId = req.user.id;
      const limit = req.query.limit;

      const result = await bookService.getPersonalizedBooks(userId, limit);

      logger.info('Personalized books fetched', {
        userId,
        count: result.books.length,
        personalized: result.meta.personalized,
      });

      res.status(200).json(formatSuccess(result, 'Personalized books retrieved successfully'));
    } catch (error) {
      next(error);
    }
  },

/**
 * Get book by ID - Public access
 * GET /api/books/:id
 */
async getBookById(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    console.log('=== BOOK DETAIL REQUEST ===');
    console.log('Book ID:', id);
    console.log('User ID:', userId || 'Guest');
    
    validateBookId(id);
    
    const book = await bookService.getBookById(id, userId);
    
    console.log('Book found:', book?.title);
    
    res.status(200).json(formatSuccess(book, 'Book retrieved successfully'));
  } catch (error) {
    console.error('Get book error:', error);
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
   * Permanently delete a book
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
   * Submit a draft/rejected book for admin review
   * POST /api/books/:id/submit
   */
  async getBookForEdit(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      validateBookId(id);
      const book = await bookService.getBookForEdit(id, userId);
      res.status(200).json(formatSuccess(book, 'Book retrieved for editing'));
    } catch (error) {
      next(error);
    }
  },

  async submitBookForReview(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      validateBookId(id);

      const book = await bookService.submitBookForReview(id, userId);
      res.status(200).json(formatSuccess(book, 'Book submitted for review'));
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
/**
 * Get book format by ID for direct checkout
 * GET /api/books/formats/:id
 */
async getBookFormatById(req, res, next) {
  try {
    const { id } = req.params;

    const { data: bookFormat, error } = await supabaseAdmin
      .from('book_formats')
      .select(`
        id,
        format_type,
        price,
        currency,
        book:books!inner (
          id,
          title,
          author_name,
          cover_image_url
        )
      `)
      .eq('id', id)
      .single();

    if (error || !bookFormat) {
      return res.status(404).json({
        success: false,
        error: { message: 'Book format not found' },
      });
    }

    res.status(200).json({
      success: true,
      data: bookFormat,
    });
  } catch (error) {
    next(error);
  }
},

  /**
   * Stream uploaded book file for owner preview (PDF inline / audio).
   * GET /api/books/formats/:id/preview
   */
  async previewBookFormat(req, res, next) {
    try {
      const userId = req.user.id;
      const { id: formatId } = req.params;

      const { format, error } = await bookRepository.getFormatForOwnerPreview(formatId, userId);

      if (error === 'Format not found') {
        return res.status(404).json({ success: false, error: { message: error } });
      }
      if (error?.includes('permission')) {
        return res.status(403).json({ success: false, error: { message: error } });
      }
      if (error || !format) {
        return res.status(400).json({ success: false, error: { message: error || 'Preview unavailable' } });
      }

      const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
        .from('booknest')
        .createSignedUrl(format.storage_path, 120);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        return res.status(500).json({
          success: false,
          error: { message: 'Failed to generate preview link' },
        });
      }

      const response = await fetch(signedUrlData.signedUrl);
      if (!response.ok) {
        throw new Error(`Storage returned ${response.status}`);
      }

      const isPdf = format.format_type === 'PDF';
      const contentType = isPdf ? 'application/pdf' : 'audio/mpeg';
      const fileExt = isPdf ? 'pdf' : 'mp3';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="preview-${formatId}.${fileExt}"`);
      res.setHeader('Accept-Ranges', 'bytes');

      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      if (response.body) {
        const { Readable } = await import('stream');
        const { pipeline } = await import('stream/promises');
        const nodeStream = Readable.fromWeb(response.body);
        await pipeline(nodeStream, res);
        return;
      }

      const fileBuffer = await response.arrayBuffer();
      res.setHeader('Content-Length', fileBuffer.byteLength);
      res.send(Buffer.from(fileBuffer));
    } catch (error) {
      logger.error('Format preview error', { error: error.message });
      next(error);
    }
  },

};