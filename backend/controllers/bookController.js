import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../config/supabase.js';

const BOOK_BUCKET = 'booknest';

const getFileExtension = (file) => {
  const parts = file.originalname.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : 'bin';
};

const uploadToStorage = async (file, path) => {
  const { error } = await supabaseAdmin.storage
    .from(BOOK_BUCKET)
    .upload(path, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });

  if (error) {
    throw error;
  }

  const { data } = supabaseAdmin.storage.from(BOOK_BUCKET).getPublicUrl(path);
  return {
    path,
    url: data?.publicUrl || null
  };
};

const normalizeBookRow = (book) => ({
  id: book.id,
  isbn: book.isbn,
  title: book.title,
  subtitle: book.subtitle,
  description: book.description,
  language: book.language,
  genre: book.genre,
  publication_date: book.publication_date,
  cover_image_url: book.cover_image_url,
  cover_image_path: book.cover_image_path,
  status: book.status,
  created_at: book.created_at,
  category: book.categories
    ? {
        id: book.categories.id,
        name: book.categories.name,
        slug: book.categories.slug
      }
    : null,
  author: book.author_profiles
    ? {
        id: book.author_profiles.id,
        pen_name: book.author_profiles.pen_name
      }
    : null,
  publisher: book.publisher_profiles
    ? {
        id: book.publisher_profiles.id,
        company_name: book.publisher_profiles.company_name
      }
    : null,
  formats: (book.book_formats || []).map((format) => ({
    id: format.id,
    format_type: format.format_type,
    price: format.price,
    currency: format.currency,
    page_count: format.page_count,
    duration_sec: format.duration_sec
  }))
});

const canManageBook = async (userId, role, bookId) => {
  if (role === 'admin') {
    return true;
  }

  const { data: book } = await supabaseAdmin
    .from('books')
    .select('uploaded_by')
    .eq('id', bookId)
    .maybeSingle();

  return book?.uploaded_by === userId;
};

export const createBook = async (req, res) => {
  try {
    const {
      title,
      subtitle,
      description,
      category_id,
      author_profile_id,
      publisher_profile_id,
      language,
      genre,
      publication_date,
      isbn,
      pdf_price,
      pdf_page_count,
      audio_price,
      audio_duration_sec
    } = req.body;

    const coverFile = req.files?.cover?.[0];
    const pdfFile = req.files?.pdf_file?.[0];
    const audioFile = req.files?.audio_file?.[0];

    if (!title || !category_id || !author_profile_id || !language) {
      return res.status(400).json({ error: 'title, category_id, author_profile_id, and language are required' });
    }

    if (!coverFile) {
      return res.status(400).json({ error: 'Cover file is required' });
    }

    if (!pdfFile && !audioFile) {
      return res.status(400).json({ error: 'At least one book file is required' });
    }

    const authorOwnership = await supabaseAdmin
      .from('author_profiles')
      .select('id, user_id')
      .eq('id', author_profile_id)
      .maybeSingle();

    if (!authorOwnership.data) {
      return res.status(400).json({ error: 'Invalid author_profile_id' });
    }

    if (req.user.role === 'author' && authorOwnership.data.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only create books for your own author profile' });
    }

    if (req.user.role === 'publisher') {
      if (!publisher_profile_id) {
        return res.status(400).json({ error: 'publisher_profile_id is required for publisher uploads' });
      }

      const { data: publisherOwnership } = await supabaseAdmin
        .from('publisher_profiles')
        .select('id, user_id')
        .eq('id', publisher_profile_id)
        .maybeSingle();

      if (!publisherOwnership || publisherOwnership.user_id !== req.user.id) {
        return res.status(403).json({ error: 'You can only create books for your own publisher profile' });
      }
    }

    const bookId = uuidv4();
    const coverExt = getFileExtension(coverFile);
    const coverUpload = await uploadToStorage(coverFile, `book-covers/${bookId}/cover.${coverExt}`);

    const bookInsert = {
      id: bookId,
      isbn: isbn || null,
      title: title.trim(),
      subtitle: subtitle || null,
      description: description || null,
      category_id,
      author_profile_id,
      publisher_profile_id: publisher_profile_id || null,
      language: language.trim(),
      genre: genre || null,
      publication_date: publication_date || null,
      cover_image_path: coverUpload.path,
      cover_image_url: coverUpload.url,
      status: 'draft',
      uploaded_by: req.user.id
    };

    const { data: createdBook, error: bookError } = await supabaseAdmin
      .from('books')
      .insert(bookInsert)
      .select('*')
      .single();

    if (bookError) {
      return res.status(400).json({ error: bookError.message });
    }

    const formats = [];

    if (pdfFile) {
      if (!pdf_price || !pdf_page_count) {
        return res.status(400).json({ error: 'pdf_price and pdf_page_count are required when uploading a PDF' });
      }

      const pdfExt = getFileExtension(pdfFile);
      const pdfUpload = await uploadToStorage(pdfFile, `book-files/${bookId}/book.${pdfExt}`);

      formats.push({
        book_id: bookId,
        format_type: 'PDF',
        price: Number(pdf_price),
        currency: 'ETB',
        storage_path: pdfUpload.path,
        public_url: pdfUpload.url,
        mime_type: pdfFile.mimetype,
        file_size_bytes: pdfFile.size,
        page_count: Number(pdf_page_count),
        duration_sec: null
      });
    }

    if (audioFile) {
      if (!audio_price || !audio_duration_sec) {
        return res.status(400).json({ error: 'audio_price and audio_duration_sec are required when uploading audio' });
      }

      const audioExt = getFileExtension(audioFile);
      const audioUpload = await uploadToStorage(audioFile, `book-files/${bookId}/audio.${audioExt}`);

      formats.push({
        book_id: bookId,
        format_type: 'Audio',
        price: Number(audio_price),
        currency: 'ETB',
        storage_path: audioUpload.path,
        public_url: audioUpload.url,
        mime_type: audioFile.mimetype,
        file_size_bytes: audioFile.size,
        page_count: null,
        duration_sec: Number(audio_duration_sec)
      });
    }

    const { error: formatsError } = await supabaseAdmin.from('book_formats').insert(formats);
    if (formatsError) {
      return res.status(400).json({ error: formatsError.message });
    }

    res.status(201).json({
      message: 'Book created successfully',
      book: createdBook
    });
  } catch (error) {
    console.error('Create book error:', error);
    res.status(500).json({ error: 'Failed to create book' });
  }
};

export const getAllBooks = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Math.min(Number(req.query.limit || 20), 50);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from('books')
      .select(`
        id,
        isbn,
        title,
        subtitle,
        description,
        language,
        genre,
        publication_date,
        cover_image_url,
        cover_image_path,
        status,
        created_at,
        categories ( id, name, slug ),
        author_profiles ( id, pen_name ),
        publisher_profiles ( id, company_name ),
        book_formats ( id, format_type, price, currency, page_count, duration_sec )
      `, { count: 'exact' })
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (req.query.category_id) {
      query = query.eq('category_id', req.query.category_id);
    }

    if (req.query.language) {
      query = query.eq('language', req.query.language);
    }

    if (req.query.search) {
      query = query.or(`title.ilike.%${req.query.search}%,description.ilike.%${req.query.search}%`);
    }

    const { data, error, count } = await query.range(from, to);
    if (error) {
      throw error;
    }

    res.json({
      books: (data || []).map(normalizeBookRow),
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (error) {
    console.error('Get books error:', error);
    res.status(500).json({ error: 'Failed to fetch books' });
  }
};

export const getBookById = async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('books')
      .select(`
        id,
        isbn,
        title,
        subtitle,
        description,
        language,
        genre,
        publication_date,
        cover_image_url,
        cover_image_path,
        status,
        created_at,
        categories ( id, name, slug ),
        author_profiles ( id, pen_name ),
        publisher_profiles ( id, company_name ),
        book_formats ( id, format_type, price, currency, page_count, duration_sec )
      `)
      .eq('id', req.params.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Book not found' });
    }

    res.json({ book: normalizeBookRow(data) });
  } catch (error) {
    console.error('Get book error:', error);
    res.status(500).json({ error: 'Failed to fetch book' });
  }
};

export const updateBook = async (req, res) => {
  try {
    const allowed = await canManageBook(req.user.id, req.user.role, req.params.id);
    if (!allowed) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const updates = { ...req.body };
    if (updates.subtitle === '') updates.subtitle = null;
    if (updates.description === '') updates.description = null;
    if (updates.genre === '') updates.genre = null;
    if (updates.isbn === '') updates.isbn = null;

    const { data, error } = await supabaseAdmin
      .from('books')
      .update(updates)
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({
      message: 'Book updated successfully',
      book: data
    });
  } catch (error) {
    console.error('Update book error:', error);
    res.status(500).json({ error: 'Failed to update book' });
  }
};

export const deleteBook = async (req, res) => {
  try {
    const allowed = await canManageBook(req.user.id, req.user.role, req.params.id);
    if (!allowed) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { error } = await supabaseAdmin
      .from('books')
      .delete()
      .eq('id', req.params.id);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'Book deleted successfully' });
  } catch (error) {
    console.error('Delete book error:', error);
    res.status(500).json({ error: 'Failed to delete book' });
  }
};

export const addBookFormat = async (req, res) => {
  try {
    const allowed = await canManageBook(req.user.id, req.user.role, req.params.bookId);
    if (!allowed) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { format_type, price, currency = 'ETB', storage_path, public_url, mime_type, file_size_bytes, page_count, duration_sec } = req.body;
    if (!format_type || !price || !storage_path) {
      return res.status(400).json({ error: 'format_type, price, and storage_path are required' });
    }

    const payload = {
      book_id: req.params.bookId,
      format_type,
      price,
      currency,
      storage_path,
      public_url: public_url || null,
      mime_type: mime_type || null,
      file_size_bytes: file_size_bytes || null,
      page_count: format_type === 'PDF' ? page_count : null,
      duration_sec: format_type === 'Audio' ? duration_sec : null
    };

    const { data, error } = await supabaseAdmin
      .from('book_formats')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json({
      message: 'Book format added successfully',
      format: data
    });
  } catch (error) {
    console.error('Add book format error:', error);
    res.status(500).json({ error: 'Failed to add format' });
  }
};

export const searchAuthors = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const { data, error } = await supabaseAdmin
      .from('author_profiles')
      .select('id, pen_name, full_name, bio, avatar_url, website_url')
      .eq('approval_status', 'approved')
      .or(`pen_name.ilike.%${q}%,full_name.ilike.%${q}%`)
      .limit(15)
      .order('pen_name');

    if (error) {
      throw error;
    }

    res.json({ authors: data || [] });
  } catch (error) {
    console.error('Search authors error:', error);
    res.status(500).json({ error: 'Failed to search authors' });
  }
};

export const searchBooks = getAllBooks;

export const advancedSearch = getAllBooks;

export const getCategories = async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('categories')
      .select('id, slug, name, description')
      .eq('is_active', true)
      .order('name');

    if (error) {
      throw error;
    }

    res.json({ categories: data || [] });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
};

export const getBooksByCategory = async (req, res) => {
  req.query.category_id = req.params.categoryId;
  return getAllBooks(req, res);
};

export const getAvailableLanguages = async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('books')
      .select('language')
      .eq('status', 'approved');

    if (error) {
      throw error;
    }

    const languages = [...new Set((data || []).map((item) => item.language).filter(Boolean))];
    res.json({ languages });
  } catch (error) {
    console.error('Get languages error:', error);
    res.status(500).json({ error: 'Failed to fetch languages' });
  }
};
