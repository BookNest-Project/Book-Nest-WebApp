import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { fileUploadService } from '../services/fileUploadService.js';

export const bookRepository = {
/**
 * Create a book for author (author_name auto from user profile)
 */
async createAuthorBook(bookData, formats, userId, userRole, authorProfile) {
  try {
    const { existing, error: dupError } = await this.findByTitleAndLanguage(
      bookData.title,
      bookData.language
    );
    if (dupError) return { book: null, error: dupError };
    if (existing) {
      return {
        book: null,
        error: 'A book with this title and language already exists.',
        conflict: true,
        existingBookId: existing.uploaded_by === userId ? existing.id : null,
      };
    }

    // Create book
    const { data: book, error: bookError } = await supabaseAdmin
      .from('books')
      .insert({
        title: bookData.title,
        subtitle: bookData.subtitle || null,
        description: bookData.description || null,
        language: bookData.language,
        publication_date: bookData.publication_date || null,
        genre_id: bookData.genre_id,
        author_name: authorProfile.pen_name || authorProfile.display_name,
        author_user_id: userId,
        publisher_name: bookData.publisher_name || null,
        publisher_user_id: bookData.publisher_user_id || null,
        cover_image_path: bookData.cover_image_path,
        cover_image_url: bookData.cover_image_url,
        status: bookData.status || 'draft',
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

    // Create formats (optional for drafts)
    let createdFormats = [];
    const formatsToInsert = (formats || []).map(format => ({
      book_id: book.id,
      format_type: format.format_type,
      price: format.price,
      currency: 'ETB',
      storage_path: format.storage_path,
      file_size_bytes: format.file_size_bytes,
      page_count: format.page_count ?? null,
      duration_sec: format.duration_sec ?? null,
      is_active: true,
    }));

    if (formatsToInsert.length > 0) {
      const { data, error: formatsError } = await supabaseAdmin
        .from('book_formats')
        .insert(formatsToInsert)
        .select();

      if (formatsError) {
        await supabaseAdmin.from('books').delete().eq('id', book.id);
        return { book: null, error: formatsError.message };
      }

      createdFormats = data || [];
    }

    return { 
      book: { ...book, formats: createdFormats }, 
      error: null 
    };
  } catch (error) {
    console.error('Create author book error:', error);
    return { book: null, error: error.message };
  }
},

/**
 * Get publisher suggestions for authors
 */
async getPublisherSuggestions(searchTerm) {
  try {
    let query = supabaseAdmin
      .from('publisher_profiles')
      .select('user_id, company_name')
      .limit(10);

    if (searchTerm && searchTerm.length >= 2) {
      query = query.ilike('company_name', `%${searchTerm}%`);
    }

    const { data: profiles, error } = await query;

    if (error) {
      return { suggestions: [], error: error.message };
    }

    const suggestions = profiles.map(profile => ({
      id: profile.user_id,
      name: profile.company_name,
    }));

    return { suggestions, error: null };
  } catch (error) {
    return { suggestions: [], error: error.message };
  }
},

/**
 * Find an active non-archived book with the same title (case-insensitive) and language.
 */
async findByTitleAndLanguage(title, language, excludeBookId = null) {
  try {
    const normalizedTitle = String(title || '').trim().toLowerCase();
    const lang = String(language || '').trim();
    if (!normalizedTitle || !lang) {
      return { existing: null, error: null };
    }

    const { data, error } = await supabaseAdmin
      .from('books')
      .select('id, title, language, uploaded_by, uploaded_by_role, status, is_active')
      .eq('language', lang)
      .neq('status', 'archived');

    if (error) {
      return { existing: null, error: error.message };
    }

    const existing = (data || []).find((b) => {
      if (excludeBookId && b.id === excludeBookId) return false;
      if (b.is_active === false) return false;
      return String(b.title || '').trim().toLowerCase() === normalizedTitle;
    });

    return { existing: existing || null, error: null };
  } catch (error) {
    return { existing: null, error: error.message };
  }
},

async createBook(bookData, formats, userId, userRole) {
  try {
    const { existing, error: dupError } = await this.findByTitleAndLanguage(
      bookData.title,
      bookData.language
    );
    if (dupError) return { book: null, error: dupError };
    if (existing) {
      return {
        book: null,
        error: 'A book with this title and language already exists.',
        conflict: true,
        existingBookId: existing.uploaded_by === userId ? existing.id : null,
      };
    }

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
        status: bookData.status || 'draft',
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

    // Create formats (optional for drafts)
    let createdFormats = [];
    const formatsToInsert = (formats || []).map(format => ({
      book_id: book.id,
      format_type: format.format_type,
      price: format.price,
      currency: format.currency || 'ETB',
      storage_path: format.storage_path,
      file_size_bytes: format.file_size_bytes,
      page_count: format.page_count ?? null,
      duration_sec: format.duration_sec ?? null,
      is_active: true,
    }));

    if (formatsToInsert.length > 0) {
      const { data, error: formatsError } = await supabaseAdmin
        .from('book_formats')
        .insert(formatsToInsert)
        .select();

      if (formatsError) {
        console.error('Create formats error:', formatsError);
        // Rollback: delete the book if formats fail
        await supabaseAdmin.from('books').delete().eq('id', book.id);
        return { book: null, error: formatsError.message };
      }

      createdFormats = data || [];
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

async submitForReview(bookId, userId) {
  try {
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('books')
      .select('id, uploaded_by, status, title, language, genre_id, cover_image_path')
      .eq('id', bookId)
      .single();

    if (checkError || !existing) {
      return { book: null, error: 'Book not found' };
    }

    if (existing.uploaded_by !== userId) {
      return { book: null, error: 'You do not have permission to submit this book' };
    }

    if (existing.status !== 'draft' && existing.status !== 'rejected') {
      return { book: null, error: 'Only draft or rejected books can be submitted' };
    }

    // Completeness validation before submitting
    if (!existing.title || String(existing.title).trim().length === 0) {
      return { book: null, error: 'Title is required before submitting' };
    }
    if (!existing.language) {
      return { book: null, error: 'Language is required before submitting' };
    }
    if (!existing.genre_id) {
      return { book: null, error: 'Genre is required before submitting' };
    }
    if (!existing.cover_image_path) {
      return { book: null, error: 'Cover image is required before submitting' };
    }

    const { data: formats, error: formatsError } = await supabaseAdmin
      .from('book_formats')
      .select('id, format_type, price, page_count, duration_sec, storage_path')
      .eq('book_id', bookId)
      .eq('is_active', true);

    if (formatsError) {
      return { book: null, error: formatsError.message };
    }

    if (!formats || formats.length === 0) {
      return { book: null, error: 'At least one format (PDF or Audio) is required before submitting' };
    }

    for (const f of formats) {
      if (f.price === null || f.price === undefined || Number(f.price) < 0) {
        return { book: null, error: `Invalid price for ${f.format_type} format` };
      }
      if (!f.storage_path) {
        return { book: null, error: `Missing file for ${f.format_type} format` };
      }
      if (f.format_type === 'PDF' && (!f.page_count || f.page_count <= 0)) {
        return { book: null, error: 'PDF page count is missing. Re-upload the PDF.' };
      }
      if (f.format_type === 'Audio' && (!f.duration_sec || f.duration_sec <= 0)) {
        return { book: null, error: 'Audio duration is missing. Re-upload the audio.' };
      }
    }

    const { data: book, error } = await supabaseAdmin
      .from('books')
      .update({ status: 'pending_review', submitted_at: new Date().toISOString() })
      .eq('id', bookId)
      .select()
      .single();

    if (error) {
      return { book: null, error: error.message };
    }

    return { book, error: null };
  } catch (error) {
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
      .select('uploaded_by, status')
      .eq('id', bookId)
      .single();

    if (checkError || !existingBook) {
      return { book: null, error: 'Book not found' };
    }

    if (existingBook.uploaded_by !== userId) {
      return { book: null, error: 'You do not have permission to update this book' };
    }

    const nextTitle = updates.title !== undefined ? updates.title : undefined;
    const nextLanguage = updates.language !== undefined ? updates.language : undefined;
    if (nextTitle !== undefined || nextLanguage !== undefined) {
      const { data: current } = await supabaseAdmin
        .from('books')
        .select('title, language')
        .eq('id', bookId)
        .single();
      const checkTitle = nextTitle !== undefined ? nextTitle : current?.title;
      const checkLanguage = nextLanguage !== undefined ? nextLanguage : current?.language;
      const { existing, error: dupError } = await this.findByTitleAndLanguage(
        checkTitle,
        checkLanguage,
        bookId
      );
      if (dupError) return { book: null, error: dupError };
      if (existing) {
        return {
          book: null,
          error: 'A book with this title and language already exists.',
          conflict: true,
        };
      }
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

    // Approved edits require re-approval
    if (existingBook.status === 'approved') {
      allowedUpdates.status = 'pending_review';
      allowedUpdates.reviewed_at = null;
      allowedUpdates.reviewed_by_admin_id = null;
      allowedUpdates.submitted_at = new Date().toISOString();
    }

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
 * Permanently delete a book (DB row + storage files). Formats cascade via FK.
 */
async deleteBook(bookId, userId) {
  try {
    const { data: existingBook, error: checkError } = await supabaseAdmin
      .from('books')
      .select('uploaded_by, cover_image_path')
      .eq('id', bookId)
      .single();

    if (checkError || !existingBook) {
      return { error: 'Book not found' };
    }

    if (existingBook.uploaded_by !== userId) {
      return { error: 'You do not have permission to delete this book' };
    }

    const { data: formats } = await supabaseAdmin
      .from('book_formats')
      .select('storage_path')
      .eq('book_id', bookId);

    const { data: deleted, error: deleteError } = await supabaseAdmin
      .from('books')
      .delete()
      .eq('id', bookId)
      .select('id')
      .single();

    if (deleteError) {
      console.error('Delete book error:', deleteError);
      if (/foreign key|violates foreign key|23503/i.test(deleteError.message || '')) {
        return {
          error:
            'This book cannot be deleted because it is linked to purchases or other records. Contact support if you need help.',
        };
      }
      return { error: deleteError.message };
    }

    if (!deleted) {
      return { error: 'Delete failed' };
    }

    if (existingBook.cover_image_path) {
      await fileUploadService.deleteFile(existingBook.cover_image_path);
    }
    for (const format of formats || []) {
      if (format.storage_path) {
        await fileUploadService.deleteFile(format.storage_path);
      }
    }

    logger.info('Book permanently deleted', { bookId, userId });
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
      .eq('uploaded_by', userId)
      .eq('is_active', true);

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
      .eq('is_active', true)
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
        .select('id, book_id, format_type, price, currency, page_count, duration_sec, is_active')
        .in('book_id', bookIds);

      if (!formatsError && formats) {
        formatsMap = formats.reduce((acc, format) => {
          if (!acc[format.book_id]) acc[format.book_id] = [];
          acc[format.book_id].push({
            id: format.id,
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
    // First, get book IDs that match the format filter (if specified)
    let bookIdsFromFormat = null;
    
    if (format && (format === 'PDF' || format === 'Audio')) {
      const { data: formatBooks, error: formatError } = await supabaseAdmin
        .from('book_formats')
        .select('book_id')
        .eq('format_type', format)
        .eq('is_active', true);

      if (formatError) {
        console.error('Format filter error:', formatError);
        return { books: [], total: 0, error: formatError.message };
      }

      if (formatBooks.length === 0) {
        // No books with this format
        return { books: [], total: 0, error: null };
      }

      bookIdsFromFormat = formatBooks.map(f => f.book_id);
    }

    // Build the main query
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

    // Apply format filter (filter by book IDs that have the format)
    if (bookIdsFromFormat && bookIdsFromFormat.length > 0) {
      query = query.in('id', bookIdsFromFormat);
    }

    // Apply genre filter
    if (genreId && genreId !== 'all' && genreId !== '') {
      query = query.eq('genre_id', genreId);
    }

    // Marketplace: approved books only
    query = query.eq('status', 'approved').eq('is_active', true);

    // Apply search filter
    if (search && search.trim()) {
      query = query.or(`title.ilike.%${search}%,author_name.ilike.%${search}%`);
    }

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to).order('created_at', { ascending: false });

    const { data: books, error, count } = await query;

    if (error) {
      console.error('Book findMany error:', error);
      return { books: [], total: 0, error: error.message };
    }

    // Get formats for each book
    const allBookIds = books.map(b => b.id);
    let formatsMap = {};

    if (allBookIds.length > 0) {
      const { data: formats, error: formatsError } = await supabaseAdmin
        .from('book_formats')
        .select('book_id, id, format_type, price, currency, page_count, duration_sec, file_size_bytes')
        .in('book_id', allBookIds)
        .eq('is_active', true);

      if (!formatsError && formats) {
        formatsMap = formats.reduce((acc, format) => {
          if (!acc[format.book_id]) acc[format.book_id] = [];
          acc[format.book_id].push({
            id: format.id,
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
    console.error('Book findMany unexpected error:', error);
    return { books: [], total: 0, error: error.message };
  }
},

  async findPersonalized({ genreIds, limit = 6 }) {
    try {
      if (!genreIds?.length) {
        return { books: [], error: null };
      }

      const { data: books, error } = await supabaseAdmin
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
        .in('genre_id', genreIds)
        .eq('status', 'approved')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(Math.min(50, Math.max(1, limit)));

      if (error) {
        console.error('Book findPersonalized error:', error);
        return { books: [], error: error.message };
      }

      const allBookIds = (books || []).map((b) => b.id);
      let formatsMap = {};

      if (allBookIds.length > 0) {
        const { data: formats, error: formatsError } = await supabaseAdmin
          .from('book_formats')
          .select('book_id, id, format_type, price, currency, page_count, duration_sec, file_size_bytes')
          .in('book_id', allBookIds)
          .eq('is_active', true);

        if (!formatsError && formats) {
          formatsMap = formats.reduce((acc, format) => {
            if (!acc[format.book_id]) acc[format.book_id] = [];
            acc[format.book_id].push({
              id: format.id,
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

      const booksWithFormats = (books || [])
        .map((book) => ({
          ...book,
          formats: formatsMap[book.id] || [],
        }))
        .filter((book) => book.formats.length > 0);

      return { books: booksWithFormats, error: null };
    } catch (error) {
      console.error('Book findPersonalized unexpected error:', error);
      return { books: [], error: error.message };
    }
  },

 
  /**
 * Get single book by ID with all details (public access for approved books)
 */
async findByIdForOwner(bookId, userId) {
  try {
    const { data: book, error } = await supabaseAdmin
      .from('books')
      .select(`
        id,
        isbn,
        title,
        subtitle,
        description,
        author_name,
        author_user_id,
        publisher_name,
        publisher_user_id,
        language,
        publication_date,
        cover_image_url,
        cover_image_path,
        status,
        genre_id,
        created_at,
        updated_at,
        uploaded_by,
        uploaded_by_role,
        genre:genres!inner (
          id,
          name,
          slug
        )
      `)
      .eq('id', bookId)
      .single();

    if (error || !book) {
      return { book: null, error: 'Book not found' };
    }

    if (book.uploaded_by !== userId) {
      return { book: null, error: 'You do not have permission to view this book' };
    }

    const { data: formats } = await supabaseAdmin
      .from('book_formats')
      .select('id, format_type, price, currency, page_count, duration_sec, file_size_bytes, storage_path, is_active')
      .eq('book_id', bookId);

    book.formats = (formats || []).map((f) => ({
      id: f.id,
      format_type: f.format_type,
      price: parseFloat(f.price),
      currency: f.currency,
      page_count: f.page_count,
      duration_sec: f.duration_sec,
      file_size_bytes: f.file_size_bytes,
      storage_path: f.storage_path,
      is_active: f.is_active,
    }));

    return { book, error: null };
  } catch (error) {
    return { book: null, error: error.message };
  }
},

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
        uploaded_by,
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
      .eq('id', bookId);

    const { data: book, error } = await query.single();

    if (error || !book) {
      return { book: null, error: error?.message || 'Book not found' };
    }

    const isOwner = userId && book.uploaded_by === userId;
    if (!isOwner && book.status !== 'approved') {
      return { book: null, error: 'Book not found' };
    }

    let formatsQuery = supabaseAdmin
      .from('book_formats')
      .select('id, format_type, price, currency, page_count, duration_sec, file_size_bytes, storage_path, is_active')
      .eq('book_id', bookId);

    if (!isOwner) {
      formatsQuery = formatsQuery.eq('is_active', true);
    }

    const { data: formats, error: formatsError } = await formatsQuery;

    if (!formatsError && formats) {
      book.formats = formats.map((f) => ({
        id: f.id,
        format_type: f.format_type,
        price: parseFloat(f.price),
        currency: f.currency,
        page_count: f.page_count,
        duration_sec: f.duration_sec,
        file_size_bytes: f.file_size_bytes,
        storage_path: f.storage_path,
        is_active: f.is_active,
      }));
    } else {
      book.formats = [];
    }

    delete book.uploaded_by;

    return { book, error: null };
  } catch (error) {
    console.error('Book findById error:', error);
    return { book: null, error: error.message };
  }
},

async updateFormatPrice(bookId, userId, formatType, price) {
  try {
    const { data: book } = await supabaseAdmin
      .from('books')
      .select('uploaded_by')
      .eq('id', bookId)
      .single();
    if (!book || book.uploaded_by !== userId) {
      return { error: 'You do not have permission to update this book' };
    }
    const { error } = await supabaseAdmin
      .from('book_formats')
      .update({ price })
      .eq('book_id', bookId)
      .eq('format_type', formatType);
    if (error) return { error: error.message };
    return { error: null };
  } catch (error) {
    return { error: error.message };
  }
},

async addBookFormat(bookId, userId, formatRow) {
  try {
    const { data: book, error: bookError } = await supabaseAdmin
      .from('books')
      .select('id, uploaded_by, status')
      .eq('id', bookId)
      .single();

    if (bookError || !book) {
      return { format: null, error: 'Book not found' };
    }
    if (book.uploaded_by !== userId) {
      return { format: null, error: 'You do not have permission to update this book' };
    }

    const { data: existing } = await supabaseAdmin
      .from('book_formats')
      .select('id')
      .eq('book_id', bookId)
      .eq('format_type', formatRow.format_type)
      .maybeSingle();

    if (existing) {
      return { format: null, error: `This book already has a ${formatRow.format_type} format` };
    }

    const isActive = book.status !== 'approved';

    const { data: format, error: insertError } = await supabaseAdmin
      .from('book_formats')
      .insert({
        book_id: bookId,
        format_type: formatRow.format_type,
        price: formatRow.price,
        currency: formatRow.currency || 'ETB',
        storage_path: formatRow.storage_path,
        file_size_bytes: formatRow.file_size_bytes,
        page_count: formatRow.page_count ?? null,
        duration_sec: formatRow.duration_sec ?? null,
        is_active: isActive,
      })
      .select()
      .single();

    if (insertError) {
      return { format: null, error: insertError.message };
    }

    return { format, error: null };
  } catch (error) {
    return { format: null, error: error.message };
  }
},

async updateBookFromUpload(bookId, userId, bookUpdates, formatUpdates = []) {
  try {
    const { data: existingBook, error: checkError } = await supabaseAdmin
      .from('books')
      .select('uploaded_by, status, title, language')
      .eq('id', bookId)
      .single();

    if (checkError || !existingBook) {
      return { book: null, error: 'Book not found' };
    }
    if (existingBook.uploaded_by !== userId) {
      return { book: null, error: 'You do not have permission to update this book' };
    }

    const nextTitle = bookUpdates.title ?? existingBook.title;
    const nextLanguage = bookUpdates.language ?? existingBook.language;
    const { existing, error: dupError } = await this.findByTitleAndLanguage(
      nextTitle,
      nextLanguage,
      bookId
    );
    if (dupError) return { book: null, error: dupError };
    if (existing) {
      return {
        book: null,
        error: 'A book with this title and language already exists.',
        conflict: true,
      };
    }

    const allowedUpdates = { ...bookUpdates };
    if (existingBook.status === 'approved') {
      allowedUpdates.status = 'pending_review';
      allowedUpdates.reviewed_at = null;
      allowedUpdates.reviewed_by_admin_id = null;
    }

    const { data: book, error: updateError } = await supabaseAdmin
      .from('books')
      .update(allowedUpdates)
      .eq('id', bookId)
      .select()
      .single();

    if (updateError) {
      return { book: null, error: updateError.message };
    }

    for (const fmt of formatUpdates) {
      const { data: existingFmt } = await supabaseAdmin
        .from('book_formats')
        .select('id')
        .eq('book_id', bookId)
        .eq('format_type', fmt.format_type)
        .maybeSingle();

      if (existingFmt) {
        await supabaseAdmin
          .from('book_formats')
          .update({
            price: fmt.price,
            storage_path: fmt.storage_path,
            file_size_bytes: fmt.file_size_bytes,
            page_count: fmt.page_count ?? null,
            duration_sec: fmt.duration_sec ?? null,
          })
          .eq('id', existingFmt.id);
      } else {
        const isActive = existingBook.status !== 'approved';
        await supabaseAdmin.from('book_formats').insert({
          book_id: bookId,
          format_type: fmt.format_type,
          price: fmt.price,
          currency: 'ETB',
          storage_path: fmt.storage_path,
          file_size_bytes: fmt.file_size_bytes,
          page_count: fmt.page_count ?? null,
          duration_sec: fmt.duration_sec ?? null,
          is_active: isActive,
        });
      }
    }

    const { book: fullBook, error: fetchError } = await this.findByIdForOwner(bookId, userId);
    if (fetchError) return { book: null, error: fetchError };
    return { book: fullBook, error: null };
  } catch (error) {
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

  async findDistinctLanguages() {
    try {
      // Prefer reading enum values directly (books.language is enum).
      // This requires a Postgres function exposed as an RPC in Supabase.
      const { data: enumData, error: enumError } = await supabaseAdmin.rpc('get_book_languages');
      if (!enumError && Array.isArray(enumData)) {
        const langs = enumData.map((v) => String(v).trim()).filter(Boolean);
        return { languages: langs, error: null };
      }

      const { data, error } = await supabaseAdmin
        .from('books')
        .select('language')
        .not('language', 'is', null)
        .order('language', { ascending: true });

      if (error) {
        logger.error('Languages find error', { error: error.message });
        return { languages: [], error: error.message };
      }

      const set = new Set((data || []).map((r) => String(r.language || '').trim()).filter(Boolean));
      return { languages: Array.from(set), error: null };
    } catch (error) {
      logger.error('Languages find unexpected error', { error: error.message });
      return { languages: [], error: error.message };
    }
  },
}