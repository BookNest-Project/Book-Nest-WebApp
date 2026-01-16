import { supabaseAdmin } from '../config/supabase.js';

/**
 * CREATE BOOK - Only authors and publishers can create
 */
export const createBook = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    console.log(`📚 Create book request by user: ${userId} (${userRole})`);

    // Get data from request - ONLY fields that exist in your schema
    const {
      title,
      description,
      author_name,        // Required: string
      publisher_name,     // Optional: string  
      category_id,        // Required: UUID
      language = 'english',
      cover_image_url
    } = req.body;

    // Validate required fields
    if (!title || !author_name || !category_id) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['title', 'author_name', 'category_id']
      });
    }

    // Check permissions
    if (userRole !== 'author' && userRole !== 'publisher' && userRole !== 'admin') {
      return res.status(403).json({
        error: 'Permission denied',
        message: 'Only authors, publishers, and admins can create books'
      });
    }

    // Prepare book data - ONLY fields that exist in YOUR schema
    const bookData = {
      title: title.trim(),
      description: description?.trim() || null,
      author_name: author_name.trim(),
      author_id: null,  // Will try to link to author user
      publisher_name: publisher_name?.trim() || null,
      publisher_id: null,
      category_id: category_id,
      language: language.toLowerCase(),
      cover_image_url: cover_image_url || null,
      uploaded_by: userId
      // NO genre field - it doesn't exist in your schema!
      // NO page_count field - it's in book_formats table!
    };

    console.log('📦 Book data prepared for insert');

    // Try to find matching author in users table
    if (author_name) {
      const { data: matchingAuthors, error: searchError } = await supabaseAdmin
        .from('users')
        .select('id, display_name')
        .eq('role', 'author')
        .ilike('display_name', author_name.trim());

      if (!searchError && matchingAuthors && matchingAuthors.length === 1) {
        bookData.author_id = matchingAuthors[0].id;
        console.log(`✅ Linked to author: ${matchingAuthors[0].display_name}`);
      }
    }

    // Auto-set publisher if user is a publisher
    if (userRole === 'publisher') {
      bookData.publisher_id = userId;
      console.log(`✅ Auto-set publisher: ${userId}`);
    }

    // Auto-set author if user is an author AND name matches
    if (userRole === 'author') {
      // We need to get user's display_name first
      const { data: currentUser } = await supabaseAdmin
        .from('users')
        .select('display_name')
        .eq('id', userId)
        .single();
      
      if (currentUser && author_name.toLowerCase() === currentUser.display_name.toLowerCase()) {
        bookData.author_id = userId;
        console.log(`✅ Auto-set author to self: ${currentUser.display_name}`);
      }
    }

    // Insert the book
    const { data: newBook, error: insertError } = await supabaseAdmin
      .from('books')
      .insert(bookData)
      .select(`
        id,
        title,
        description,
        author_name,
        author_id,
        publisher_name,
        publisher_id,
        category_id,
        language,
        cover_image_url,
        uploaded_by,
        created_at
      `)
      .single();

    if (insertError) {
      console.error('❌ Database error:', insertError);
      
      // Provide helpful error messages
      if (insertError.code === '23503') {
        return res.status(400).json({
          error: 'Invalid category',
          message: 'The category_id does not exist in categories table'
        });
      }
      
      if (insertError.code === '23505') {
        return res.status(400).json({
          error: 'Duplicate entry',
          message: 'A similar book already exists'
        });
      }
      
      return res.status(500).json({
        error: 'Failed to create book',
        details: insertError.message
      });
    }

    console.log(`✅ Book created: ${newBook.id}`);

    // Success response
    res.status(201).json({
      message: 'Book created successfully',
      book: newBook
    });

  } catch (error) {
    console.error('🔥 Error in createBook:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

/**
 * GET ALL BOOKS
 */
export const getAllBooks = async (req, res) => {
  try {
    const { page = 1, limit = 20, category_id, author_id, language, search } = req.query;
    
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Start query
    let query = supabaseAdmin
      .from('books')
      .select(`
        id,
        title,
        description,
        author_name,
        author_id,
        publisher_name,
        category_id,
        language,
        cover_image_url,
        created_at,
        categories(name)
      `, { count: 'exact' })
      .order('created_at', { ascending: false });

    // Apply filters
    if (category_id) query = query.eq('category_id', category_id);
    if (author_id) query = query.eq('author_id', author_id);
    if (language) query = query.eq('language', language);
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,author_name.ilike.%${search}%`);
    }

    // Pagination
    query = query.range(from, to);

    const { data: books, error, count } = await query;

    if (error) {
      console.error('❌ Error fetching books:', error);
      return res.status(500).json({ error: 'Failed to fetch books' });
    }

    res.json({
      books: books || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });

  } catch (error) {
    console.error('🔥 Error in getAllBooks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET SINGLE BOOK BY ID
 */
export const getBookById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: book, error } = await supabaseAdmin
      .from('books')
      .select(`
        *,
        categories(name, description),
        book_formats(
          id,
          format_type,
          price,
          page_count,
          duration_sec,
          file_url,
          created_at
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Book not found' });
      }
      return res.status(500).json({ error: 'Failed to fetch book' });
    }

    res.json({ book });

  } catch (error) {
    console.error('🔥 Error in getBookById:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * UPDATE BOOK
 */
export const updateBook = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { id } = req.params;

    // Check if book exists and user has permission
    const { data: existingBook, error: fetchError } = await supabaseAdmin
      .from('books')
      .select('uploaded_by, author_id, publisher_id')
      .eq('id', id)
      .single();

    if (fetchError || !existingBook) {
      return res.status(404).json({ error: 'Book not found' });
    }

    // Permission check
    const canEdit = (
      existingBook.uploaded_by === userId ||
      existingBook.author_id === userId ||
      existingBook.publisher_id === userId ||
      userRole === 'admin'
    );

    if (!canEdit) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Get updatable fields
    const {
      title,
      description,
      author_name,
      publisher_name,
      category_id,
      language,
      cover_image_url
    } = req.body;

    // Build updates
    const updates = {};
    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description?.trim() || null;
    if (author_name !== undefined) updates.author_name = author_name.trim();
    if (publisher_name !== undefined) updates.publisher_name = publisher_name?.trim() || null;
    if (category_id !== undefined) updates.category_id = category_id;
    if (language !== undefined) updates.language = language.toLowerCase();
    if (cover_image_url !== undefined) updates.cover_image_url = cover_image_url;

    // Update author_id if author_name changed
    if (author_name && author_name !== existingBook.author_name) {
      const { data: matchingAuthors } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('role', 'author')
        .ilike('display_name', author_name.trim());

      if (matchingAuthors && matchingAuthors.length === 1) {
        updates.author_id = matchingAuthors[0].id;
      } else {
        updates.author_id = null;
      }
    }

    // Update the book
    const { data: updatedBook, error: updateError } = await supabaseAdmin
      .from('books')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (updateError) {
      console.error('❌ Update error:', updateError);
      return res.status(500).json({ error: 'Failed to update book' });
    }

    res.json({
      message: 'Book updated successfully',
      book: updatedBook
    });

  } catch (error) {
    console.error('🔥 Error in updateBook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * DELETE BOOK
 */
export const deleteBook = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { id } = req.params;

    // Check if book exists
    const { data: existingBook, error: fetchError } = await supabaseAdmin
      .from('books')
      .select('uploaded_by, title')
      .eq('id', id)
      .single();

    if (fetchError || !existingBook) {
      return res.status(404).json({ error: 'Book not found' });
    }

    // Permission check
    const canDelete = (
      existingBook.uploaded_by === userId ||
      userRole === 'admin'
    );

    if (!canDelete) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Delete book (cascade will delete formats)
    const { error: deleteError } = await supabaseAdmin
      .from('books')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('❌ Delete error:', deleteError);
      return res.status(500).json({ error: 'Failed to delete book' });
    }

    res.json({
      message: 'Book deleted successfully',
      deleted_title: existingBook.title
    });

  } catch (error) {
    console.error('🔥 Error in deleteBook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * SEARCH AUTHORS
 */
export const searchAuthors = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query too short' });
    }

    const { data: authors, error } = await supabaseAdmin
      .from('users')
      .select('id, display_name, bio, avatar_url')
      .eq('role', 'author')
      .ilike('display_name', `%${q}%`)
      .limit(10);

    if (error) {
      console.error('❌ Search error:', error);
      return res.status(500).json({ error: 'Search failed' });
    }

    res.json({ authors: authors || [] });

  } catch (error) {
    console.error('🔥 Error in searchAuthors:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * ADD BOOK FORMAT (PDF or Audio)
 */
export const addBookFormat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { bookId } = req.params;
    
    const {
      format_type,  // 'PDF' or 'Audio'
      file_url,
      price,
      page_count,    // For PDF
      duration_sec   // For Audio
    } = req.body;

    // Validate
    if (!format_type || !['PDF', 'Audio'].includes(format_type)) {
      return res.status(400).json({ error: 'Invalid format type' });
    }

    if (!price || price < 50) {
      return res.status(400).json({ error: 'Price must be ≥ 50 ETB' });
    }

    if (format_type === 'PDF' && !page_count) {
      return res.status(400).json({ error: 'Page count required for PDF' });
    }

    if (format_type === 'Audio' && !duration_sec) {
      return res.status(400).json({ error: 'Duration required for Audio' });
    }

    // Check book exists and permissions
    const { data: book, error: bookError } = await supabaseAdmin
      .from('books')
      .select('uploaded_by, author_id, publisher_id')
      .eq('id', bookId)
      .single();

    if (bookError || !book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    // Permission check
    const canAddFormat = (
      book.uploaded_by === userId ||
      book.author_id === userId ||
      book.publisher_id === userId
    );

    if (!canAddFormat) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Insert format
    const formatData = {
      book_id: bookId,
      format_type,
      file_url,
      price: parseFloat(price),
      page_count: page_count ? parseInt(page_count) : null,
      duration_sec: duration_sec ? parseInt(duration_sec) : null
    };

    const { data: newFormat, error: insertError } = await supabaseAdmin
      .from('book_formats')
      .insert(formatData)
      .select('*')
      .single();

    if (insertError) {
      console.error('❌ Format insert error:', insertError);
      return res.status(500).json({ error: 'Failed to add format' });
    }

    res.status(201).json({
      message: 'Book format added successfully',
      format: newFormat
    });

  } catch (error) {
    console.error('🔥 Error in addBookFormat:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};