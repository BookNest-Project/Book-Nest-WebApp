import { fileUploadService } from '../services/fileUploadService.js';
import { bookService } from '../services/bookService.js';
import { formatSuccess } from '../utils/responseFormatter.js';
import { logger } from '../utils/logger.js';
import { supabaseAdmin } from '../config/supabase.js';

export const uploadController = {
    
  async uploadBook(req, res, next) {
    try {
      logger.debug('Upload request received', {
        userId: req.user?.id,
        role: req.user?.role,
        hasCover: !!req.files?.cover,
        hasPdf: !!req.files?.pdf,
        hasAudio: !!req.files?.audio,
      });
      
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

      // Prepare book data based on role
      let finalAuthorName = '';
      let finalAuthorUserId = null;
      let finalPublisherName = '';
      let finalPublisherUserId = null;

      if (userRole === 'author') {
        // Author uploading their own book
        finalAuthorName = req.user.publicName;
        finalAuthorUserId = userId;
        
        // Publisher association: only link by explicit publisher_user_id (safe).
        let linkedPublisherId = publisher_user_id || null;
        let linkedPublisherName = publisher_name || null;

        if (linkedPublisherId) {
          const { data: existingPublisher, error } = await supabaseAdmin
            .from('publisher_profiles')
            .select('user_id, company_name')
            .eq('user_id', linkedPublisherId)
            .single();
          if (error || !existingPublisher) {
            throw new Error('Invalid publisher_user_id');
          }
          linkedPublisherName = existingPublisher.company_name;
        }

        finalPublisherName = linkedPublisherName;
        finalPublisherUserId = linkedPublisherId;
        
      } else if (userRole === 'publisher') {
        // Publisher uploading a book (author is entered)
        finalPublisherName = req.user.publicName;
        finalPublisherUserId = userId;
        
        // Author association: only link by explicit author_user_id (safe).
        let linkedAuthorId = author_user_id || null;
        let linkedAuthorName = author_name || null;

        if (linkedAuthorId) {
          const { data: existingAuthor, error } = await supabaseAdmin
            .from('author_profiles')
            .select('user_id, pen_name')
            .eq('user_id', linkedAuthorId)
            .single();
          if (error || !existingAuthor) {
            throw new Error('Invalid author_user_id');
          }
          linkedAuthorName = existingAuthor.pen_name;
        }

        finalAuthorName = linkedAuthorName;
        finalAuthorUserId = linkedAuthorId;
      }

      const bookData = {
        title,
        subtitle: subtitle || null,
        description: description || null,
        language,
        publication_date: publication_date || null,
        genre_id,
        author_name: finalAuthorName,
        author_user_id: finalAuthorUserId,
        publisher_name: finalPublisherName,
        publisher_user_id: finalPublisherUserId,
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