import { fileUploadService } from '../services/fileUploadService.js';
import { bookService } from '../services/bookService.js';
import { formatSuccess } from '../utils/responseFormatter.js';
import { logger } from '../utils/logger.js';

export const uploadController = {
  /**
   * Upload a new book with cover image and files
   * POST /api/books/upload
   */
  async uploadBook(req, res, next) {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;

      if (userRole !== 'author' && userRole !== 'publisher') {
        return res.status(403).json({
          success: false,
          error: { message: 'Only authors and publishers can upload books' },
        });
      }

      const {
        title,
        subtitle,
        description,
        isbn,
        language,
        publication_date,
        genre_id,
        author_name,
        author_user_id,
        publisher_name,
        publisher_user_id,
        pdf_price,
        audio_price,
        pdf_page_count,
        audio_duration_sec,
      } = req.body;

      // Validate required fields
      if (!title) throw new Error('Title is required');
      if (!language) throw new Error('Language is required');
      if (!genre_id) throw new Error('Genre is required');
      if (!req.files?.cover) throw new Error('Cover image is required');

      // Upload cover image
      const cover = await fileUploadService.uploadCoverImage(req.files.cover[0], userId);

      // Prepare formats array
      const formats = [];

      // Handle PDF format
      if (req.files.pdf && req.files.pdf[0]) {
        const pdfFile = req.files.pdf[0];
        const pdfUpload = await fileUploadService.uploadPdfFile(pdfFile, userId);
        
        formats.push({
          format_type: 'PDF',
          price: parseFloat(pdf_price) || 0,
          currency: 'ETB',
          storage_path: pdfUpload.path,
          file_size_bytes: pdfUpload.size,
          page_count: parseInt(pdf_page_count) || null,
          duration_sec: null,
        });
      }

      // Handle Audio format
      if (req.files.audio && req.files.audio[0]) {
        const audioFile = req.files.audio[0];
        const audioUpload = await fileUploadService.uploadAudioFile(audioFile, userId);
        
        formats.push({
          format_type: 'Audio',
          price: parseFloat(audio_price) || 0,
          currency: 'ETB',
          storage_path: audioUpload.path,
          file_size_bytes: audioUpload.size,
          page_count: null,
          duration_sec: parseInt(audio_duration_sec) || null,
        });
      }

      if (formats.length === 0) {
        throw new Error('At least one format (PDF or Audio) is required');
      }

      // Create book
      const bookData = {
        title,
        subtitle: subtitle || null,
        description: description || null,
        isbn: isbn || null,
        language,
        publication_date: publication_date || null,
        genre_id,
        author_name: userRole === 'author' ? userRole === 'author' ? req.user.publicName : author_name : author_name,
        author_user_id: userRole === 'author' ? userId : (author_user_id || null),
        publisher_name: userRole === 'publisher' ? req.user.publicName : publisher_name,
        publisher_user_id: userRole === 'publisher' ? userId : (publisher_user_id || null),
        cover_image_path: cover.path,
        cover_image_url: cover.url,
        formats,
      };

      const book = await bookService.createBook(bookData, userId, userRole);

      logger.info('Book uploaded successfully', { bookId: book.id, userId });

      res.status(201).json(formatSuccess(book, 'Book uploaded successfully'));
    } catch (error) {
      logger.error('Upload book error', { error: error.message });
      next(error);
    }
  },
};