import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

export const bookRepository = {
  /**
   * Get all books with filters, search, and pagination
   * Only returns approved books for public access
   */

  // ============================================
// Add these methods to your existing bookRepository
// ============================================

/**
 * Create a new book with formats
 */
async createBook(bookData, formats, userId, userRole) {
  try {
    // Start a transaction
    const { data: book, error: bookError } = await supabaseAdmin
      .from('books')
      .insert({
        title: bookData.title,
        subtitle: bookData.subtitle || null,
        description: bookData.description || null,
        isbn: bookData.isbn || null,
        language: bookData.language,
        publication_date: bookData.publication_date || null,
        genre_id: bookData.genre_id,
        author_name: bookData.author_name,
        author_user_id: bookData.author_user_id || null,
        publisher_name: bookData.publisher_name || null,
        publisher_user_id: bookData.publisher_user_id || null,
        cover_image_path: bookData.cover_image_path,
        cover_image_url: bookData.cover_image_url,
        status: 'draft',
        uploaded_by: userId,
        uploaded_by_role: userRole,
        is_active: true,
      })
      .select()
      .single();

    if (bookError) {
      console.error('Create book error:', bookError);
      return { book: null, error: bookError.message };
    }

    // Create formats
    const formatsToInsert = formats.map(format => ({
      book_id: book.id,
      format_type: format.format_type,
      price: format.price,
      currency: format.currency || 'ETB',
      storage_path: format.storage_path,
      file_size_bytes: format.file_size_bytes,
      page_count: format.page_count || null,
      duration_sec: format.duration_sec || null,
      is_active: true,
    }));

    const { data: createdFormats, error: formatsError } = await supabaseAdmin
      .from('book_formats')
      .insert(formatsToInsert)
      .select();

    if (formatsError) {
      console.error('Create formats error:', formatsError);
      // Rollback: delete the book if formats fail
      await supabaseAdmin.from('books').delete().eq('id', book.id);
      return { book: null, error: formatsError.message };
    }

    return { 
      book: { ...book, formats: createdFormats }, 
      error: null 
    };
  } catch (error) {
    console.error('Create book unexpected error:', error);
    return { book: null, error: error.message };
  }
},

/**
 * Update an existing book
 */
async updateBook(bookId, userId, updates) {
  try {
    // First check if user owns this book
    const { data: existingBook, error: checkError } = await supabaseAdmin
      .from('books')
      .select('uploaded_by')
      .eq('id', bookId)
      .single();

    if (checkError || !existingBook) {
      return { book: null, error: 'Book not found' };
    }

    if (existingBook.uploaded_by !== userId) {
      return { book: null, error: 'You do not have permission to update this book' };
    }

    // Prepare update data (only allowed fields)
    const allowedUpdates = {
      title: updates.title,
      subtitle: updates.subtitle,
      description: updates.description,
      isbn: updates.isbn,
      language: updates.language,
      publication_date: updates.publication_date,
      genre_id: updates.genre_id,
      author_name: updates.author_name,
      publisher_name: updates.publisher_name,
      is_active: updates.is_active,
    };

    // Remove undefined fields
    Object.keys(allowedUpdates).forEach(key => {
      if (allowedUpdates[key] === undefined) {
        delete allowedUpdates[key];
      }
    });

    const { data: book, error: updateError } = await supabaseAdmin
      .from('books')
      .update(allowedUpdates)
      .eq('id', bookId)
      .select()
      .single();

    if (updateError) {
      console.error('Update book error:', updateError);
      return { book: null, error: updateError.message };
    }

    // Get formats
    const { data: formats, error: formatsError } = await supabaseAdmin
      .from('book_formats')
      .select('*')
      .eq('book_id', bookId);

    if (formatsError) {
      console.error('Fetch formats error:', formatsError);
    }

    return { 
      book: { ...book, formats: formats || [] }, 
      error: null 
    };
  } catch (error) {
    console.error('Update book unexpected error:', error);
    return { book: null, error: error.message };
  }
},

/**
 * Delete (soft delete) a book
 */
async deleteBook(bookId, userId) {
  try {
    // Check ownership
    const { data: existingBook, error: checkError } = await supabaseAdmin
      .from('books')
      .select('uploaded_by')
      .eq('id', bookId)
      .single();

    if (checkError || !existingBook) {
      return { error: 'Book not found' };
    }

    if (existingBook.uploaded_by !== userId) {
      return { error: 'You do not have permission to delete this book' };
    }

    // Soft delete - just mark as inactive
    const { error: updateError } = await supabaseAdmin
      .from('books')
      .update({ is_active: false, status: 'archived' })
      .eq('id', bookId);

    if (updateError) {
      console.error('Delete book error:', updateError);
      return { error: updateError.message };
    }

    return { error: null };
  } catch (error) {
    console.error('Delete book unexpected error:', error);
    return { error: error.message };
  }
},

/**
 * Get books uploaded by a specific user
 */
async getBooksByUser(userId, page = 1, limit = 20) {
  try {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Get total count
    const { count, error: countError } = await supabaseAdmin
      .from('books')
      .select('id', { count: 'exact', head: true })
      .eq('uploaded_by', userId);

    if (countError) {
      console.error('Count books error:', countError);
      return { books: [], total: 0, error: countError.message };
    }

    // Get books
    const { data: books, error: booksError } = await supabaseAdmin
      .from('books')
      .select(`
        id,
        title,
        subtitle,
        description,
        author_name,
        publisher_name,
        cover_image_url,
        language,
        publication_date,
        status,
        is_active,
        sales_count,
        total_revenue,
        created_at,
        genre:genres!inner (
          id,
          name,
          slug
        )
      `)
      .eq('uploaded_by', userId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (booksError) {
      console.error('Get user books error:', booksError);
      return { books: [], total: 0, error: booksError.message };
    }

    // Get formats for each book
    const bookIds = books.map(b => b.id);
    let formatsMap = {};

    if (bookIds.length > 0) {
      const { data: formats, error: formatsError } = await supabaseAdmin
        .from('book_formats')
        .select('book_id, format_type, price, currency, page_count, duration_sec, is_active')
        .in('book_id', bookIds);

      if (!formatsError && formats) {
        formatsMap = formats.reduce((acc, format) => {
          if (!acc[format.book_id]) acc[format.book_id] = [];
          acc[format.book_id].push({
            format_type: format.format_type,
            price: parseFloat(format.price),
            currency: format.currency,
            page_count: format.page_count,
            duration_sec: format.duration_sec,
            is_active: format.is_active,
          });
          return acc;
        }, {});
      }
    }

    const booksWithFormats = books.map(book => ({
      ...book,
      formats: formatsMap[book.id] || [],
    }));

    return {
      books: booksWithFormats,
      total: count || 0,
      error: null,
    };
  } catch (error) {
    console.error('Get user books unexpected error:', error);
    return { books: [], total: 0, error: error.message };
  }
},

/**
 * Update book cover image
 */
async updateBookCover(bookId, userId, coverImagePath, coverImageUrl) {
  try {
    // Check ownership
    const { data: existingBook, error: checkError } = await supabaseAdmin
      .from('books')
      .select('uploaded_by')
      .eq('id', bookId)
      .single();

    if (checkError || !existingBook) {
      return { error: 'Book not found' };
    }

    if (existingBook.uploaded_by !== userId) {
      return { error: 'You do not have permission to update this book' };
    }

    const { error: updateError } = await supabaseAdmin
      .from('books')
      .update({ 
        cover_image_path: coverImagePath,
        cover_image_url: coverImageUrl 
      })
      .eq('id', bookId);

    if (updateError) {
      console.error('Update cover error:', updateError);
      return { error: updateError.message };
    }

    return { error: null };
  } catch (error) {
    console.error('Update cover unexpected error:', error);
    return { error: error.message };
  }
},

  async findMany({ genreId, format, search, page = 1, limit = 12, userId = null }) {
    try {
      let query = supabaseAdmin
        .from('books')
        .select(`
          id,
          isbn,
          title,
          subtitle,
          description,
          author_name,
          publisher_name,
          language,
          publication_date,
          cover_image_url,
          status,
          created_at,
          updated_at,
          genre:genres!inner (
            id,
            name,
            slug,
            description,
            is_active
          )
        `, { count: 'exact' });

      // Only show approved books for public
      if (!userId) {
        query = query.eq('status', 'approved');
      } else {
        // For logged-in users: show approved + their own drafts
        query = query.or(`status.eq.approved, and(status.eq.draft, uploaded_by.eq.${userId})`);
      }

      // Apply filters
      if (genreId) {
        query = query.eq('genre_id', genreId);
      }

      if (search) {
        query = query.or(`title.ilike.%${search}%,author_name.ilike.%${search}%`);
      }

      // Apply pagination
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to).order('created_at', { ascending: false });

      const { data: books, error, count } = await query;

      if (error) {
        logger.error('Book findMany error', { error: error.message });
        return { books: [], total: 0, error: error.message };
      }

      // Get formats for each book
      const bookIds = books.map(b => b.id);
      let formatsMap = {};

      if (bookIds.length > 0) {
        const { data: formats, error: formatsError } = await supabaseAdmin
          .from('book_formats')
          .select('book_id, format_type, price, currency, page_count, duration_sec, file_size_bytes')
          .in('book_id', bookIds);

        if (!formatsError && formats) {
          formatsMap = formats.reduce((acc, format) => {
            if (!acc[format.book_id]) acc[format.book_id] = [];
            acc[format.book_id].push({
              format_type: format.format_type,
              price: parseFloat(format.price),
              currency: format.currency,
              page_count: format.page_count,
              duration_sec: format.duration_sec,
              file_size_bytes: format.file_size_bytes,
            });
            return acc;
          }, {});
        }
      }

      // Combine books with their formats
      const booksWithFormats = books.map(book => ({
        ...book,
        formats: formatsMap[book.id] || [],
      }));

      return {
        books: booksWithFormats,
        total: count || 0,
        error: null,
      };
    } catch (error) {
      logger.error('Book findMany unexpected error', { error: error.message });
      return { books: [], total: 0, error: error.message };
    }
  },

  /**
   * Get single book by ID with all details
   */
  async findById(bookId, userId = null) {
    try {
      let query = supabaseAdmin
        .from('books')
        .select(`
          id,
          isbn,
          title,
          subtitle,
          description,
          author_name,
          publisher_name,
          language,
          publication_date,
          cover_image_url,
          status,
          created_at,
          updated_at,
          genre:genres!inner (
            id,
            name,
            slug,
            description,
            is_active
          )
        `)
        .eq('id', bookId)
        .single();

      // For public, only approved books
      if (!userId) {
        query = query.eq('status', 'approved');
      }

      const { data: book, error } = await query;

      if (error || !book) {
        return { book: null, error: error?.message || 'Book not found' };
      }

      // Get formats
      const { data: formats, error: formatsError } = await supabaseAdmin
        .from('book_formats')
        .select('format_type, price, currency, page_count, duration_sec, file_size_bytes, storage_path')
        .eq('book_id', bookId);

      if (!formatsError && formats) {
        book.formats = formats.map(f => ({
          format_type: f.format_type,
          price: parseFloat(f.price),
          currency: f.currency,
          page_count: f.page_count,
          duration_sec: f.duration_sec,
          file_size_bytes: f.file_size_bytes,
          storage_path: f.storage_path,
        }));
      } else {
        book.formats = [];
      }

      return { book, error: null };
    } catch (error) {
      logger.error('Book findById error', { bookId, error: error.message });
      return { book: null, error: error.message };
    }
  },

  /**
   * Get all active genres
   */
  async findAllGenres() {
    try {
      const { data: genres, error } = await supabaseAdmin
        .from('genres')
        .select('id, name, slug, description, is_active')
        .eq('is_active', true)
        .order('name');

      if (error) {
        logger.error('Genre find error', { error: error.message });
        return { genres: [], error: error.message };
      }

      return { genres, error: null };
    } catch (error) {
      logger.error('Genre find unexpected error', { error: error.message });
      return { genres: [], error: error.message };
    }
  },
}