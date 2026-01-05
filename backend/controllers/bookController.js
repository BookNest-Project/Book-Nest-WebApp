import { supabaseAdmin } from '../config/supabase.js';

// Create a new book (title, description, etc.)
export const createBook = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const userDisplayName = req.user.displayName;

    const {
      title,
      description,
      author_name,        // required - string
      publisher_name,     // optional - string
      category_id,
      language = 'english',
      cover_image_url
    } = req.body;

    // Validation: required fields
    if (!title || !author_name || !category_id) {
      return res.status(400).json({
        error: 'Missing required fields: title, author_name, and category_id are required'
      });
    }

    // Prepare book data
    const bookData = {
      title,
      description: description || null,
      author_name: author_name.trim(),
      author_id: null,  // We'll set if match found
      publisher_name: publisher_name?.trim() || null,
      publisher_id: null,  // We'll set if applicable
      category_id,
      language,
      cover_image_url: cover_image_url || null,
      uploaded_by: userId,
      created_at: new Date().toISOString()
    };

    // Smart Linking for Author
    if (author_name) {
      // Search for matching author user (case-insensitive exact match)
      const { data: matchingAuthors, error: searchError } = await supabaseAdmin
        .from('users')
        .select('id, display_name')
        .eq('role', 'author')
        .ilike('display_name', author_name.trim());  // ilike = case-insensitive

      if (searchError) {
        console.error('❌ Author search error:', searchError);
      } else if (matchingAuthors.length === 1) {
        // Exact one match → auto-link
        bookData.author_id = matchingAuthors[0].id;
        bookData.author_name = matchingAuthors[0].display_name;  // Use correct spelling!
        console.log(`✅ Auto-linked author_id: ${bookData.author_id}`);
      } else if (matchingAuthors.length > 1) {
        // Multiple matches → don't link, but warn in logs/response
        console.warn(`⚠️ Multiple authors match "${author_name}" – not linking`);
      } else {
        // No match → keep provided name, no ID
        console.log(`ℹ️ No matching author found for "${author_name}" – using name only`);
      }
    }

    // For Publisher: Auto-fill if not provided and user is publisher
    if (userRole === 'publisher') {
      bookData.publisher_id = userId;
      bookData.publisher_name = publisher_name?.trim() || userDisplayName;
    }

    // If user is author: Auto-set author if not provided
    if (userRole === 'author') {
      bookData.author_id = userId;
      bookData.author_name = author_name.trim() || userDisplayName;
    }

    // Insert the book
    const { data: newBook, error } = await supabaseAdmin
      .from('books')
      .insert(bookData)
      .select(`
        id,
        title,
        author_name,
        author_id,
        publisher_name,
        publisher_id,
        created_at,
        cover_image_url
      `)
      .single();

    if (error) {
      console.error('❌ Book creation DB error:', error);
      return res.status(500).json({ error: 'Failed to save book' });
    }

    res.status(201).json({
      message: 'Book created successfully',
      book: newBook,
      note: bookData.author_id ? 'Author linked successfully' : 'Author name used (no profile linked)'
    });

  } catch (error) {
    console.error('🔥 Error in createBook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const searchAuthors = async (req, res) => {
  try {
    const { q } = req.query;  // q = search query

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const { data: authors, error } = await supabaseAdmin
      .from('users')
      .select('id, display_name, bio, avatar_url')
      .eq('role', 'author')
      .ilike('display_name', `%${q}%`)  // Fuzzy search
      .limit(10);

    if (error) {
      console.error('❌ Author search error:', error);
      return res.status(500).json({ error: 'Search failed' });
    }

    res.json({
      authors: authors.map(author => ({
        id: author.id,  // Frontend can use if needed
        name: author.display_name,
        bio: author.bio,
        avatar: author.avatar_url
      }))
    });

  } catch (error) {
    console.error('🔥 Error in searchAuthors:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const addBookFormat = async (req, res) => {
  res.status(501).json({ message: 'Add format endpoint not implemented yet' });
};