import { bookRepository } from '../repositories/bookRepository.js';
import { ValidationError ,ForbiddenError, NotFoundError} from '../utils/errors.js';
import { logger } from '../utils/logger.js';


export const bookService = {

  /**
 * Create a book for author
 */
async createAuthorBook(bookData, formats, userId, coverImagePath, coverImageUrl) {
  // Validation
  if (!bookData.title) throw new ValidationError('Title is required');
  if (!bookData.language) throw new ValidationError('Language is required');
  if (!bookData.genre_id) throw new ValidationError('Genre is required');
  if (!formats || formats.length === 0) {
    throw new ValidationError('At least one format (PDF or Audio) is required');
  }

  // Validate formats
  for (const format of formats) {
    if (format.price === undefined || format.price < 0) {
      throw new ValidationError(`Price is required for ${format.format_type} format`);
    }
    if (format.format_type === 'PDF' && !format.page_count) {
      throw new ValidationError('Page count is required for PDF format');
    }
    if (format.format_type === 'Audio' && !format.duration_sec) {
      throw new ValidationError('Duration is required for Audio format');
    }
    if (!format.storage_path) {
      throw new ValidationError(`File path is required for ${format.format_type} format`);
    }
  }

  // Get author profile
  const { data: authorProfile, error: profileError } = await supabaseAdmin
    .from('author_profiles')
    .select('pen_name, display_name')
    .eq('user_id', userId)
    .single();

  if (profileError || !authorProfile) {
    throw new ValidationError('Author profile not found');
  }

  const authorName = authorProfile.pen_name || authorProfile.display_name;

  const bookDataWithAuthor = {
    ...bookData,
    cover_image_path: coverImagePath,
    cover_image_url: coverImageUrl,
  };

  const { book, error } = await bookRepository.createAuthorBook(
    bookDataWithAuthor,
    formats,
    userId,
    'author',
    { pen_name: authorName, display_name: authorProfile.display_name }
  );

  if (error) throw new Error(error);

  logger.info('Author book created successfully', { bookId: book.id, userId });

  return book;
},

/**
 * Get publisher suggestions
 */
async getPublisherSuggestions(searchTerm) {
  const { suggestions, error } = await bookRepository.getPublisherSuggestions(searchTerm);
  if (error) throw new Error(error);
  return suggestions;
},

/**
 * Create a book (handles both author and publisher)
 */
async createBook(bookData, userId, userRole) {
  // Validation
  if (!bookData.title) throw new ValidationError('Title is required');
  if (!bookData.language) throw new ValidationError('Language is required');
  if (!bookData.genre_id) throw new ValidationError('Genre is required');
  if (!bookData.formats || bookData.formats.length === 0) {
    throw new ValidationError('At least one format (PDF or Audio) is required');
  }

  // Validate formats
  for (const format of bookData.formats) {
    if (format.price === undefined || format.price < 0) {
      throw new ValidationError(`Price is required for ${format.format_type} format`);
    }
    if (format.format_type === 'PDF' && !format.page_count) {
      throw new ValidationError('Page count is required for PDF format');
    }
    if (format.format_type === 'Audio' && !format.duration_sec) {
      throw new ValidationError('Duration is required for Audio format');
    }
    if (!format.storage_path) {
      throw new ValidationError(`File path is required for ${format.format_type} format`);
    }
  }

  const { book, error } = await bookRepository.createBook(
    bookData,
    bookData.formats,
    userId,
    userRole
  );

  if (error) throw new Error(error);

  logger.info('Book created successfully', { bookId: book.id, userId, userRole });

  return book;
},

  async getBooks({ genreId, format, search, page, limit, userId }) {
  // Validate and sanitize inputs
  const validatedPage = Math.max(1, parseInt(page) || 1);
  const validatedLimit = Math.min(50, Math.max(1, parseInt(limit) || 12));
  const validatedGenreId = genreId && genreId !== 'all' && genreId !== '' ? genreId : null;
  const validatedSearch = search ? String(search).trim() : null;
  const validatedFormat = format && (format === 'PDF' || format === 'Audio') ? format : null;

  const result = await bookRepository.findMany({
    genreId: validatedGenreId,
    format: validatedFormat,
    search: validatedSearch,
    page: validatedPage,
    limit: validatedLimit,
    userId,
  });

  if (result.error) {
    throw new Error(result.error);
  }

  const totalPages = Math.ceil(result.total / validatedLimit);

  return {
    books: result.books,
    pagination: {
      page: validatedPage,
      limit: validatedLimit,
      total: result.total,
      totalPages,
    },
  };
},
/**
 * Get book by ID - PUBLIC ACCESS for approved books
 */
async getBookById(bookId, userId = null) {
  if (!bookId) {
    throw new ValidationError('Book ID is required');
  }

  const { book, error } = await bookRepository.findById(bookId, userId);

  if (error || !book) {
    throw new NotFoundError('Book');
  }

  return book;
},

  async getGenres() {
    const { genres, error } = await bookRepository.findAllGenres();

    if (error) {
      throw new Error(error);
    }

    return genres;
  },

  /**
   * Update an existing book
   */
  async updateBook(bookId, userId, updates) {
    if (!bookId) {
      throw new ValidationError('Book ID is required');
    }

    // Allowed fields to update
    const allowedUpdates = {};
    
    if (updates.title !== undefined) allowedUpdates.title = updates.title;
    if (updates.subtitle !== undefined) allowedUpdates.subtitle = updates.subtitle;
    if (updates.description !== undefined) allowedUpdates.description = updates.description;
    if (updates.isbn !== undefined) allowedUpdates.isbn = updates.isbn;
    if (updates.language !== undefined) allowedUpdates.language = updates.language;
    if (updates.publication_date !== undefined) allowedUpdates.publication_date = updates.publication_date;
    if (updates.genre_id !== undefined) allowedUpdates.genre_id = updates.genre_id;
    if (updates.author_name !== undefined) allowedUpdates.author_name = updates.author_name;
    if (updates.publisher_name !== undefined) allowedUpdates.publisher_name = updates.publisher_name;
    if (updates.is_active !== undefined) allowedUpdates.is_active = updates.is_active;

    if (Object.keys(allowedUpdates).length === 0) {
      throw new ValidationError('No valid fields to update');
    }

    const { book, error } = await bookRepository.updateBook(bookId, userId, allowedUpdates);

    if (error === 'Book not found') {
      throw new NotFoundError('Book');
    }
    if (error === 'You do not have permission to update this book') {
      throw new ForbiddenError(error);
    }
    if (error) {
      throw new Error(error);
    }

    logger.info('Book updated successfully', { bookId, userId });

    return book;
  },

  /**
   * Delete (soft delete) a book
   */
  async deleteBook(bookId, userId) {
    if (!bookId) {
      throw new ValidationError('Book ID is required');
    }

    const { error } = await bookRepository.deleteBook(bookId, userId);

    if (error === 'Book not found') {
      throw new NotFoundError('Book');
    }
    if (error === 'You do not have permission to delete this book') {
      throw new ForbiddenError(error);
    }
    if (error) {
      throw new Error(error);
    }

    logger.info('Book deleted successfully', { bookId, userId });

    return true;
  },

  /**
   * Get books uploaded by current user
   */
  async getMyBooks(userId, page = 1, limit = 20) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    const validatedPage = Math.max(1, parseInt(page) || 1);
    const validatedLimit = Math.min(50, Math.max(1, parseInt(limit) || 20));

    const { books, total, error } = await bookRepository.getBooksByUser(
      userId,
      validatedPage,
      validatedLimit
    );

    if (error) {
      throw new Error(error);
    }

    const totalPages = Math.ceil(total / validatedLimit);

    return {
      books,
      pagination: {
        page: validatedPage,
        limit: validatedLimit,
        total,
        totalPages,
      },
    };
  },

  /**
   * Update book cover image
   */
  async updateBookCover(bookId, userId, coverImagePath, coverImageUrl) {
    if (!bookId) {
      throw new ValidationError('Book ID is required');
    }
    if (!coverImagePath || !coverImageUrl) {
      throw new ValidationError('Cover image path and URL are required');
    }

    const { error } = await bookRepository.updateBookCover(bookId, userId, coverImagePath, coverImageUrl);

    if (error === 'Book not found') {
      throw new NotFoundError('Book');
    }
    if (error === 'You do not have permission to update this book') {
      throw new ForbiddenError(error);
    }
    if (error) {
      throw new Error(error);
    }

    logger.info('Book cover updated', { bookId, userId });

    return true;
  },

};