import { supabaseAdmin } from '../config/supabase.js'; 
import { v4 as uuidv4 } from 'uuid';
import { bookFormatSchema } from '../middleware/validation.js';
/**
 * CREATE BOOK - Only authors and publishers can create
 */
export const createBook = async (req, res) => {
  // We'll use a transaction ID for rollback tracking
  const transactionId = uuidv4();
  let uploadedBookId = null;
  
  try {
    console.log(`📚 [${transactionId}] Book creation started`);
    
    // Get user info
    const userId = req.user.id;
    const userRole = req.user.role;
    const userDisplayName = req.user.displayName;
    
    console.log(`👤 User: ${userDisplayName} (${userRole})`);
    
    // Check if user can create books
    if (userRole !== 'author' && userRole !== 'publisher') {
      return res.status(403).json({
        error: 'Permission denied',
        message: 'Only authors and publishers can create books'
      });
    }
    
    // ========== EXTRACT DATA ==========
    // Get text fields from form-data or JSON
    const textFields = {};
    
    if (req.body) {
      // Multipart form-data sends text as req.body
      textFields.title = req.body.title?.trim();
      textFields.author_name = req.body.author_name?.trim();
      textFields.publisher_name = req.body.publisher_name?.trim();
      textFields.description = req.body.description?.trim();
      textFields.category_id = req.body.category_id;
      textFields.language = (req.body.language || 'english').toLowerCase();
      textFields.pdf_price = req.body.pdf_price ? parseFloat(req.body.pdf_price) : null;
      textFields.audio_price = req.body.audio_price ? parseFloat(req.body.audio_price) : null;
      textFields.pdf_page_count = req.body.pdf_page_count ? parseInt(req.body.pdf_page_count) : null;
      textFields.audio_duration_sec = req.body.audio_duration_sec ? parseInt(req.body.audio_duration_sec) : null;
    }
    
    // Get uploaded files
    const coverFile = req.files?.cover?.[0];
    const pdfFile = req.files?.pdf_file?.[0];
    const audioFile = req.files?.audio_file?.[0];
    
    console.log(`📎 Files received: Cover=${!!coverFile}, PDF=${!!pdfFile}, Audio=${!!audioFile}`);
    
    // ========== VALIDATION ==========
    console.log(`🔍 [${transactionId}] Validating...`);
    // Check if book with same title already exists
console.log(`🔍 Checking if book "${textFields.title}" already exists...`);
const { data: existingBooks, error: checkError } = await supabaseAdmin
  .from('books')
  .select('id, title')
  .ilike('title', textFields.title) // Case-insensitive check
  .limit(1);

if (checkError) {
  console.error('❌ Error checking existing books:', checkError);
}

if (existingBooks && existingBooks.length > 0) {
  return res.status(400).json({
    error: 'Book already exists',
    message: `A book with title "${textFields.title}" already exists`,
    existing_book_id: existingBooks[0].id
  });
}
console.log('✅ Book title is unique');

    // Required text fields
    const requiredFields = ['title', 'author_name', 'publisher_name', 'category_id'];
    const missingFields = requiredFields.filter(field => !textFields[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        missing: missingFields,
        message: `Please provide: ${missingFields.join(', ')}`
      });
    }
    
    // Must have at least one file (PDF or Audio)
    if (!pdfFile && !audioFile) {
      return res.status(400).json({
        error: 'No book file provided',
        message: 'Please upload at least one format (PDF or Audio)'
      });
    }
    
    // Must have cover image
    if (!coverFile) {
      return res.status(400).json({
        error: 'Cover image required',
        message: 'Please upload a cover image for the book'
      });
    }
    
    // Validate prices if files are uploaded
    if (pdfFile && (!textFields.pdf_price || textFields.pdf_price < 50)) {
      return res.status(400).json({
        error: 'Invalid PDF price',
        message: 'PDF price must be at least 50 ETB',
        provided: textFields.pdf_price
      });
    }
    
    if (audioFile && (!textFields.audio_price || textFields.audio_price < 50)) {
      return res.status(400).json({
        error: 'Invalid Audio price',
        message: 'Audio price must be at least 50 ETB',
        provided: textFields.audio_price
      });
    }
    
    // Validate page count for PDF
    if (pdfFile && !textFields.pdf_page_count) {
      return res.status(400).json({
        error: 'Page count required',
        message: 'Please provide page count for PDF format'
      });
    }
    
    // Validate duration for Audio
    if (audioFile && !textFields.audio_duration_sec) {
      return res.status(400).json({
        error: 'Duration required',
        message: 'Please provide duration (in seconds) for Audio format'
      });
    }
    
    console.log(`✅ [${transactionId}] Validation passed`);
    // ========== SMART LINKING ==========
    console.log(`🔗 [${transactionId}] Smart linking...`);
    
    // Generate book ID for file organization
    const bookId = uuidv4();
    uploadedBookId = bookId;
    
    // Prepare book data
    const bookData = {
      id: bookId,
      title: textFields.title,
      description: textFields.description || null,
      author_name: textFields.author_name,
      author_id: null,
      publisher_name: textFields.publisher_name,
      publisher_id: null,
      category_id: textFields.category_id,
      language: textFields.language,
      cover_image_url: null, // Will be set after upload
      uploaded_by: userId,
      created_at: new Date().toISOString()
    };
    
    // SMART LINKING BASED ON USER ROLE
    if (userRole === 'author') {
      // Author is uploading: they are the author
      bookData.author_id = userId;
      bookData.author_name = userDisplayName; // Use their exact name
      
      // Try to find publisher
      console.log(`🔍 Searching for publisher: ${textFields.publisher_name}`);
      const { data: publishers } = await supabaseAdmin
        .from('users')
        .select('id, display_name')
        .eq('role', 'publisher')
        .ilike('display_name', textFields.publisher_name);
      
      if (publishers && publishers.length === 1) {
        // Exact match found
        bookData.publisher_id = publishers[0].id;
        bookData.publisher_name = publishers[0].display_name; // Use correct spelling
        console.log(`✅ Linked to publisher: ${bookData.publisher_name}`);
      } else {
        // No match or multiple matches
        console.log(`ℹ️ Publisher not found or multiple matches. Using provided name.`);
        bookData.publisher_id = null;
      }
      
    } else if (userRole === 'publisher') {
      // Publisher is uploading: they are the publisher
      bookData.publisher_id = userId;
      bookData.publisher_name = userDisplayName; // Use their exact name
      
      // Try to find author
      console.log(`🔍 Searching for author: ${textFields.author_name}`);
      const { data: authors } = await supabaseAdmin
        .from('users')
        .select('id, display_name')
        .eq('role', 'author')
        .ilike('display_name', textFields.author_name);
      
      if (authors && authors.length === 1) {
        // Exact match found
        bookData.author_id = authors[0].id;
        bookData.author_name = authors[0].display_name; // Use correct spelling
        console.log(`✅ Linked to author: ${bookData.author_name}`);
      } else {
        // No match or multiple matches
        console.log(`ℹ️ Author not found or multiple matches. Using provided name.`);
        bookData.author_id = null;
      }
    }
    
    console.log(`✅ [${transactionId}] Smart linking complete`);
        // ========== FILE UPLOADS ==========
    console.log(`☁️ [${transactionId}] Uploading files to Supabase Storage...`);
    
    try {
      // 1. Upload cover image
      console.log(`   Uploading cover...`);
      const coverUrl = await uploadToSupabase(
        coverFile,
        `book-covers/${bookId}`,
        'cover'
      );
      bookData.cover_image_url = coverUrl;
      console.log(`   ✅ Cover uploaded: ${coverUrl.substring(0, 50)}...`);
      
      // 2. Upload PDF if exists
      let pdfUrl = null;
      if (pdfFile) {
        console.log(`   Uploading PDF...`);
        pdfUrl = await uploadToSupabase(
          pdfFile,
          `book-pdfs/${bookId}`,
          'book'
        );
        console.log(`   ✅ PDF uploaded: ${pdfUrl.substring(0, 50)}...`);
      }
      
      // 3. Upload Audio if exists
      let audioUrl = null;
      if (audioFile) {
        console.log(`   Uploading Audio...`);
        audioUrl = await uploadToSupabase(
          audioFile,
          `book-audios/${bookId}`,
          'book'
        );
        console.log(`   ✅ Audio uploaded: ${audioUrl.substring(0, 50)}...`);
      }
      
      console.log(`✅ [${transactionId}] All files uploaded`);
            // ========== DATABASE TRANSACTION ==========
      console.log(`💾 [${transactionId}] Saving to database...`);
      
      // 1. Create book record
      console.log(`   1. Creating book record...`);
      const { data: newBook, error: bookError } = await supabaseAdmin
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
      
      if (bookError) {
        console.error(`❌ Book creation failed:`, bookError);
        
        // Clean up uploaded files
        await cleanupFiles(bookId);
        
        if (bookError.code === '23503') {
          return res.status(400).json({
            error: 'Invalid category',
            message: 'The category ID does not exist in categories table'
          });
        }
        
        return res.status(500).json({
          error: 'Failed to save book',
          details: bookError.message
        });
      }
      
      console.log(`   ✅ Book record created: ${newBook.id}`);
      
      // 2. Create format records
      const formats = [];
      
      if (pdfFile && pdfUrl) {
        console.log(`   2. Creating PDF format record...`);
        const pdfFormat = {
          book_id: newBook.id,
          format_type: 'PDF',
          file_url: pdfUrl,
          price: textFields.pdf_price,
          page_count: textFields.pdf_page_count,
          created_at: new Date().toISOString()
        };
        
        const { data: pdfFormatData, error: pdfError } = await supabaseAdmin
          .from('book_formats')
          .insert(pdfFormat)
          .select('*')
          .single();
        
        if (pdfError) {
          console.error(`❌ PDF format creation failed:`, pdfError);
          throw new Error(`PDF format creation failed: ${pdfError.message}`);
        }
        
        formats.push(pdfFormatData);
        console.log(`   ✅ PDF format created`);
      }
      
      if (audioFile && audioUrl) {
        console.log(`   3. Creating Audio format record...`);
        const audioFormat = {
          book_id: newBook.id,
          format_type: 'Audio',
          file_url: audioUrl,
          price: textFields.audio_price,
          duration_sec: textFields.audio_duration_sec,
          created_at: new Date().toISOString()
        };
        
        const { data: audioFormatData, error: audioError } = await supabaseAdmin
          .from('book_formats')
          .insert(audioFormat)
          .select('*')
          .single();
        
        if (audioError) {
          console.error(`❌ Audio format creation failed:`, audioError);
          throw new Error(`Audio format creation failed: ${audioError.message}`);
        }
        
        formats.push(audioFormatData);
        console.log(`   ✅ Audio format created`);
      }
      
      console.log(`✅ [${transactionId}] Database transaction complete`);
            // ========== SUCCESS RESPONSE ==========
      console.log(`🎉 [${transactionId}] Book creation SUCCESSFUL!`);
      
      const response = {
        message: 'Book created successfully',
        book: newBook,
        formats: formats,
        links: {
          cover: bookData.cover_image_url,
          pdf: pdfUrl,
          audio: audioUrl
        }
      };
      
      // Add role-specific note
      if (userRole === 'author') {
        response.note = bookData.publisher_id 
          ? `Book linked to publisher account`
          : `Publisher not found in system - using provided name`;
      } else if (userRole === 'publisher') {
        response.note = bookData.author_id
          ? `Book linked to author account`
          : `Author not found in system - using provided name`;
      }
      
      res.status(201).json(response);
      
    } catch (uploadError) {
      console.error(`❌ [${transactionId}] File upload failed:`, uploadError);
      
      // Clean up any uploaded files
      if (uploadedBookId) {
        await cleanupFiles(uploadedBookId);
      }
      
      throw uploadError;
    }
    
  } catch (error) {
    console.error(`🔥 [${transactionId}] UNEXPECTED ERROR:`, error);
    
    res.status(500).json({
      error: 'Book creation failed',
      message: error.message,
      transactionId: transactionId
    });
  }
};

// Helper: Upload file to Supabase Storage
async function uploadToSupabase(file, folderPath, fileName) {
  try {
    const fileExt = file.originalname.split('.').pop();
    const fullPath = `${folderPath}/${fileName}.${fileExt}`;
    
    const { data, error } = await supabaseAdmin
      .storage
      .from('booknest')
      .upload(fullPath, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
        upsert: false
      });
    
    if (error) throw error;
    
    // Get public URL
    const { data: urlData } = supabaseAdmin
      .storage
      .from('booknest')
      .getPublicUrl(fullPath);
    
    return urlData.publicUrl;
    
  } catch (error) {
    console.error(`Upload failed for ${folderPath}:`, error);
    throw error;
  }
}

// Helper: Clean up files if transaction fails
async function cleanupFiles(bookId) {
  try {
    const filesToRemove = [
      `book-covers/${bookId}`,
      `book-pdfs/${bookId}`,
      `book-audios/${bookId}`
    ];
    
    await supabaseAdmin
      .storage
      .from('booknest')
      .remove(filesToRemove);
    
    console.log('✅ Cleaned up files for book:', bookId);
  } catch (error) {
    console.error('⚠️ Cleanup failed:', error);
  }
}
/**
 * GET ALL BOOKS
 */
export const getAllBooks = async (req, res) => {
  try {
    console.log('📚 Fetching all books...');
    
    // Get query parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const category_id = req.query.category_id;
    const author_id = req.query.author_id;
    const language = req.query.language;
    const search = req.query.search;
    
    // Calculate pagination
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
        publisher_name,
        category_id,
        language,
        cover_image_url,
        created_at,
        categories(name)
      `, { count: 'exact' })
      .order('created_at', { ascending: false });
    
    // Apply filters if provided
    if (category_id) {
      query = query.eq('category_id', category_id);
    }
    
    if (author_id) {
      query = query.eq('author_id', author_id);
    }
    
    if (language) {
      query = query.eq('language', language.toLowerCase());
    }
    
    if (search && search.trim().length > 0) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,author_name.ilike.%${search}%`);
    }
    
    // Apply pagination
    query = query.range(from, to);
    
    // Execute query
    const { data: books, error, count } = await query;
    
    if (error) {
      console.error('❌ Error fetching books:', error);
      return res.status(500).json({ error: 'Failed to fetch books' });
    }
    
    console.log(`✅ Found ${books?.length || 0} books`);
    
    // Return response
    res.json({
      message: 'Books retrieved successfully',
      books: books || [],
      pagination: {
        page: page,
        limit: limit,
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
    
    console.log(`📖 Fetching book: ${id}`);
    
    if (!id) {
      return res.status(400).json({ error: 'Book ID is required' });
    }
    
    // Fetch book with details and formats
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
      console.error('❌ Error fetching book:', error);
      
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Book not found' });
      }
      
      return res.status(500).json({ error: 'Failed to fetch book' });
    }
    
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    console.log(`✅ Book found: ${book.title}`);
    
    res.json({
      message: 'Book retrieved successfully',
      book: book
    });
    
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
    
    console.log(`✏️ Update book request: ${id} by ${userId} (${userRole})`);
    
    // Check if book exists
    const { data: existingBook, error: fetchError } = await supabaseAdmin
      .from('books')
      .select('uploaded_by, author_id, publisher_id')
      .eq('id', id)
      .single();
    
    if (fetchError || !existingBook) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    // Permission: only the original uploader or admin can update
    const canEdit = (
      existingBook.uploaded_by === userId ||
      userRole === 'admin'
    );

    if (!canEdit) {
      return res.status(403).json({
        error: 'Permission denied',
        message: 'Only the user who uploaded the book (or admin) can update this book'
      });
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
    
    // Prepare updates (only include provided fields)
    const updates = {};
    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description?.trim() || null;
    if (author_name !== undefined) updates.author_name = author_name.trim();
    if (publisher_name !== undefined) updates.publisher_name = publisher_name?.trim() || null;
    if (category_id !== undefined) updates.category_id = category_id;
    if (language !== undefined) updates.language = language.toLowerCase();
    if (cover_image_url !== undefined) updates.cover_image_url = cover_image_url;
    
    // If author_name changed, try to find matching author
    if (author_name && author_name !== existingBook.author_name) {
      const { data: matchingAuthors } = await supabaseAdmin
        .from('users')
        .select('id, display_name')
        .eq('role', 'author')
        .ilike('display_name', author_name.trim());
      
      if (matchingAuthors && matchingAuthors.length === 1) {
        updates.author_id = matchingAuthors[0].id;
        updates.author_name = matchingAuthors[0].display_name;
        console.log(`✅ Updated author link: ${updates.author_name}`);
      } else {
        updates.author_id = null; // Clear link if no match
        console.log(`ℹ️ Author link cleared - no match found`);
      }
    }
    
    // Update book
    const { data: updatedBook, error: updateError } = await supabaseAdmin
      .from('books')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();
    
    if (updateError) {
      console.error('❌ Update error:', updateError);
      return res.status(500).json({ error: 'Failed to update book', details: updateError.message || updateError });
    }
    
    console.log(`✅ Book updated: ${updatedBook.title}`);
    
    // If formats array provided, handle upsert/delete of book_formats
    if (Array.isArray(req.body.formats) && req.body.formats.length > 0) {
      console.log('🔁 Processing formats update...');
      const formatsInput = req.body.formats;
      const insertedIds = [];

      // helper to normalize type
      const mapFormatType = (t) => {
        if (!t) return null;
        const s = String(t).trim().toLowerCase();
        if (s === 'pdf') return 'PDF';
        if (s === 'audio') return 'Audio';
        return null;
      };

      try {
        for (const f of formatsInput) {
          const action = (f.action || 'upsert').toLowerCase();

          if (action === 'delete') {
            if (!f.id) {
              return res.status(400).json({ error: 'Format id required for delete action' });
            }
            const { error: delErr } = await supabaseAdmin
              .from('book_formats')
              .delete()
              .eq('id', f.id)
              .eq('book_id', id);

            if (delErr) {
              console.error('❌ Failed to delete format:', delErr);
              return res.status(500).json({ error: 'Failed to delete format', details: delErr.message || delErr });
            }
            continue;
          }

          // Upsert path
          const fmtType = mapFormatType(f.format_type || f.formatType || f.type);
          if (!fmtType) {
            return res.status(400).json({ error: 'Invalid format_type in formats array' });
          }

          const price = f.price ? parseFloat(f.price) : null;
          if (!price || price < 50) {
            return res.status(400).json({ error: 'Invalid price in formats array. Minimum 50' });
          }

          if (fmtType === 'PDF' && !f.page_count) {
            return res.status(400).json({ error: 'page_count required for PDF format in formats array' });
          }

          if (fmtType === 'Audio' && !f.duration_sec) {
            return res.status(400).json({ error: 'duration_sec required for Audio format in formats array' });
          }

          // Build record
          const record = {
            book_id: id,
            format_type: fmtType,
            file_url: f.file_url || f.fileUrl || null,
            price: price,
            page_count: fmtType === 'PDF' ? (f.page_count ? parseInt(f.page_count) : null) : null,
            duration_sec: fmtType === 'Audio' ? (f.duration_sec ? parseInt(f.duration_sec) : null) : null,
            created_at: new Date().toISOString()
          };

          if (f.id) {
            // Update existing format
            const { data: updatedFormat, error: updErr } = await supabaseAdmin
              .from('book_formats')
              .update(record)
              .eq('id', f.id)
              .eq('book_id', id)
              .select('*')
              .single();

            if (updErr) {
              console.error('❌ Failed to update format:', updErr);
              return res.status(500).json({ error: 'Failed to update format', details: updErr.message || updErr });
            }
          } else {
            // Insert new format
            const { data: newFmt, error: insErr } = await supabaseAdmin
              .from('book_formats')
              .insert(record)
              .select('*')
              .single();

            if (insErr) {
              console.error('❌ Failed to insert format:', insErr);
              // cleanup any inserted formats so far
              if (insertedIds.length > 0) {
                await supabaseAdmin.from('book_formats').delete().in('id', insertedIds);
              }
              return res.status(500).json({ error: 'Failed to insert format', details: insErr.message || insErr });
            }

            insertedIds.push(newFmt.id);
          }
        }
      } catch (err) {
        console.error('🔥 Error processing formats array:', err);
        if (insertedIds.length > 0) {
          await supabaseAdmin.from('book_formats').delete().in('id', insertedIds);
        }
        return res.status(500).json({ error: 'Failed processing formats', details: err.message || err });
      }

      console.log('✅ Formats processed');
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


    // Delete related formats first (DB has no cascade)
    console.log(`🧹 Deleting formats for book ${id}...`);
    const { error: formatsDeleteError } = await supabaseAdmin
      .from('book_formats')
      .delete()
      .eq('book_id', id);

    if (formatsDeleteError) {
      console.error('❌ Failed to delete formats:', formatsDeleteError);
      return res.status(500).json({ error: 'Failed to delete book formats', details: formatsDeleteError.message || formatsDeleteError });
    }

    // Clean up files from storage (best-effort)
    try {
      await cleanupFiles(id);
    } catch (err) {
      console.warn('⚠️ Storage cleanup warning:', err?.message || err);
    }

    // Now delete the book record
    const { error: deleteError } = await supabaseAdmin
      .from('books')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('❌ Delete error:', deleteError);
      return res.status(500).json({ error: 'Failed to delete book', details: deleteError.message || deleteError });
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
    
    console.log(`🔍 Searching authors: "${q}"`);
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ 
        error: 'Search query must be at least 2 characters' 
      });
    }
    
    const { data: authors, error } = await supabaseAdmin
      .from('users')
      .select(`
        id,
        display_name,
        bio,
        avatar_url,
        created_at
      `)
      .eq('role', 'author')
      .or(`display_name.ilike.%${q}%,bio.ilike.%${q}%`)
      .limit(15)
      .order('display_name');
    
    if (error) {
      console.error('❌ Author search error:', error);
      return res.status(500).json({ error: 'Search failed' });
    }
    
    console.log(`✅ Found ${authors?.length || 0} authors`);
    
    res.json({
      authors: authors || [],
      count: authors?.length || 0
    });
    
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
    
    console.log(`➕ Adding format to book: ${bookId}`);
    
    // Check if multipart/form-data (file upload)
    const isMultipart = req.headers['content-type']?.includes('multipart/form-data');
    
    let formatData, file, fileField;
    
    if (isMultipart) {
      // Get data from form-data
      formatData = {
        format_type: req.body.format_type?.toUpperCase(),
        price: req.body.price ? parseFloat(req.body.price) : null,
        page_count: req.body.page_count ? parseInt(req.body.page_count) : null,
        duration_sec: req.body.duration_sec ? parseInt(req.body.duration_sec) : null
      };
      
      // Get file (PDF or Audio)
      file = req.files?.file?.[0];
      fileField = 'file';
      
    } else {
      // Get data from JSON
      const {
        format_type,
        file_url,
        price,
        page_count,
        duration_sec
      } = req.body;
      
      formatData = {
        format_type: format_type?.toUpperCase(),
        file_url: file_url,
        price: price ? parseFloat(price) : null,
        page_count: page_count ? parseInt(page_count) : null,
        duration_sec: duration_sec ? parseInt(duration_sec) : null
      };
      
      file = null;
    }
    
    // Normalize and validate format type (map to DB enum values)
    const mapFormatType = (t) => {
      if (!t) return null;
      const s = String(t).trim().toLowerCase();
      if (s === 'pdf') return 'PDF';
      if (s === 'audio') return 'Audio';
      return null;
    };

    formatData.format_type = mapFormatType(formatData.format_type);

    if (!formatData.format_type) {
      return res.status(400).json({
        error: 'Invalid format type',
        valid: ['PDF', 'Audio']
      });
    }
    
    if (!formatData.price || formatData.price < 50) {
      return res.status(400).json({
        error: 'Invalid price',
        message: 'Price must be at least 50 ETB'
      });
    }
    
    if (formatData.format_type === 'PDF' && !formatData.page_count) {
      return res.status(400).json({
        error: 'Page count required',
        message: 'Please provide page count for PDF format'
      });
    }
    
    if (formatData.format_type === 'Audio' && !formatData.duration_sec) {
      return res.status(400).json({
        error: 'Duration required',
        message: 'Please provide duration (seconds) for Audio format'
      });
    }
    
    if (isMultipart && !file) {
      return res.status(400).json({
        error: 'File required',
        message: 'Please upload a file for the format'
      });
    }
    
    if (!isMultipart && !formatData.file_url) {
      return res.status(400).json({
        error: 'File URL required',
        message: 'Please provide file_url for the format'
      });
    }
    
    // Check if book exists and user has permission
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
      return res.status(403).json({
        error: 'Permission denied',
        message: 'Only book uploader, author, or publisher can add formats'
      });
    }
    
    let fileUrl = formatData.file_url;
    
    // Upload file if provided
    if (isMultipart && file) {
      console.log('📤 Uploading file...');
      
      const folder = formatData.format_type === 'PDF' ? 'book-pdfs' : 'book-audios';
      const fileExt = file.originalname.split('.').pop();
      const filePath = `${folder}/${bookId}/book.${fileExt}`;
      
      // Upload to Supabase
      const { data: uploadData, error: uploadError } = await supabaseAdmin
        .storage
        .from('booknest')
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          cacheControl: '3600'
        });
      
      if (uploadError) {
        console.error('❌ File upload failed:', uploadError);
        return res.status(500).json({ error: 'File upload failed' });
      }
      
      // Get public URL
      const { data: urlData } = supabaseAdmin
        .storage
        .from('booknest')
        .getPublicUrl(filePath);
      
      fileUrl = urlData.publicUrl;
      console.log('✅ File uploaded:', fileUrl);
    }
    
    // Check if format already exists
    const { data: existingFormat, error: checkError } = await supabaseAdmin
      .from('book_formats')
      .select('id')
      .eq('book_id', bookId)
      .eq('format_type', formatData.format_type)
      .maybeSingle();
    
    if (checkError) {
      console.error('❌ Format check error:', checkError);
    }
    
    if (existingFormat) {
      return res.status(400).json({
        error: 'Format already exists',
        message: `${formatData.format_type} format already exists for this book`,
        existing_format_id: existingFormat.id
      });
    }
    
    // Create format record
    const formatRecord = {
      book_id: bookId,
      format_type: formatData.format_type,
      file_url: fileUrl,
      price: formatData.price,
      page_count: formatData.page_count,
      duration_sec: formatData.duration_sec,
      created_at: new Date().toISOString()
    };
    
    // Sanitize fields depending on format type to avoid DB constraint errors
    if (formatData.format_type === 'AUDIO') {
      formatRecord.page_count = null;
    }
    if (formatData.format_type === 'PDF') {
      formatRecord.duration_sec = null;
    }

    const { data: newFormat, error: insertError } = await supabaseAdmin
      .from('book_formats')
      .insert(formatRecord)
      .select('*')
      .single();

    if (insertError) {
      console.error('❌ Format creation error:', insertError);
      return res.status(500).json({ error: 'Failed to add book format', details: insertError.message || insertError });
    }
    
    console.log(`✅ ${formatData.format_type} format added to book ${bookId}`);
    
    res.status(201).json({
      message: 'Book format added successfully',
      format: newFormat
    });
    
  } catch (error) {
    console.error('🔥 Error in addBookFormat:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};