import { fileUploadService } from '../services/fileUploadService.js';
import { bookService } from '../services/bookService.js';
import { bookRepository } from '../repositories/bookRepository.js';
import { bookMetadataService } from '../services/bookMetadataService.js';
import { formatSuccess } from '../utils/responseFormatter.js';
import { logger } from '../utils/logger.js';
import { supabaseAdmin } from '../config/supabase.js';
import { ConflictError } from '../utils/errors.js';

async function buildFormatsFromFiles(req, userId) {
  const formats = [];
  const { pdf_price, audio_price } = req.body;

  if (req.files?.pdf?.[0]) {
    const pdfFile = req.files.pdf[0];
    const detectedPages = await bookMetadataService.getPdfPageCount(pdfFile.buffer);
    if (!detectedPages || detectedPages <= 0) {
      throw new Error('Could not detect PDF page count. Please upload a valid PDF.');
    }
    const pdfUpload = await fileUploadService.uploadPdfFile(pdfFile, userId);
    formats.push({
      format_type: 'PDF',
      price: parseFloat(pdf_price) || 0,
      storage_path: pdfUpload.path,
      file_size_bytes: pdfUpload.size,
      page_count: detectedPages,
      duration_sec: null,
    });
  }

  if (req.files?.audio?.[0]) {
    const audioFile = req.files.audio[0];
    const detectedDuration = await bookMetadataService.getAudioDurationSeconds(
      audioFile.buffer,
      audioFile.mimetype
    );
    if (!detectedDuration || detectedDuration <= 0) {
      throw new Error('Could not detect audio duration. Please upload a valid audio file.');
    }
    const audioUpload = await fileUploadService.uploadAudioFile(audioFile, userId);
    formats.push({
      format_type: 'Audio',
      price: parseFloat(audio_price) || 0,
      storage_path: audioUpload.path,
      file_size_bytes: audioUpload.size,
      page_count: null,
      duration_sec: detectedDuration,
    });
  }

  return formats;
}

async function resolveRoleAssociations(req, userRole, userId) {
  const {
    author_name,
    author_user_id,
    publisher_name,
    publisher_user_id,
  } = req.body;

  let finalAuthorName = '';
  let finalAuthorUserId = null;
  let finalPublisherName = '';
  let finalPublisherUserId = null;

  if (userRole === 'author') {
    finalAuthorName = req.user.publicName;
    finalAuthorUserId = userId;
    let linkedPublisherId = publisher_user_id || null;
    let linkedPublisherName = publisher_name || null;
    if (linkedPublisherId) {
      const { data: existingPublisher, error } = await supabaseAdmin
        .from('publisher_profiles')
        .select('user_id, company_name')
        .eq('user_id', linkedPublisherId)
        .single();
      if (error || !existingPublisher) throw new Error('Invalid publisher_user_id');
      linkedPublisherName = existingPublisher.company_name;
    }
    finalPublisherName = linkedPublisherName;
    finalPublisherUserId = linkedPublisherId;
  } else if (userRole === 'publisher') {
    finalPublisherName = req.user.publicName;
    finalPublisherUserId = userId;
    let linkedAuthorId = author_user_id || null;
    let linkedAuthorName = author_name || null;
    if (linkedAuthorId) {
      const { data: existingAuthor, error } = await supabaseAdmin
        .from('author_profiles')
        .select('user_id, pen_name')
        .eq('user_id', linkedAuthorId)
        .single();
      if (error || !existingAuthor) throw new Error('Invalid author_user_id');
      linkedAuthorName = existingAuthor.pen_name;
    }
    finalAuthorName = linkedAuthorName;
    finalAuthorUserId = linkedAuthorId;
  }

  return {
    finalAuthorName,
    finalAuthorUserId,
    finalPublisherName,
    finalPublisherUserId,
  };
}

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
        save_as_draft,
        submit_for_review,
      } = req.body;

      const shouldSaveDraft = String(save_as_draft || '').toLowerCase() === 'true';
      const shouldSubmitForReview = String(submit_for_review || '').toLowerCase() === 'true';
      const targetStatus = shouldSubmitForReview ? 'pending_review' : 'draft';

      // Validate required fields (submit requires completeness; drafts are flexible)
      const hasAnyDraftInput =
        !!String(title || '').trim() ||
        !!String(subtitle || '').trim() ||
        !!String(description || '').trim() ||
        !!String(language || '').trim() ||
        !!String(genre_id || '').trim() ||
        !!publisher_user_id ||
        !!String(publisher_name || '').trim() ||
        !!author_user_id ||
        !!String(author_name || '').trim() ||
        !!req.files?.cover?.[0] ||
        !!req.files?.pdf?.[0] ||
        !!req.files?.audio?.[0];

      if (shouldSaveDraft && !hasAnyDraftInput) {
        throw new Error('Enter at least one field to save a draft');
      }

      const finalTitle =
        String(title || '').trim() ||
        (shouldSaveDraft ? `Untitled draft ${new Date().toISOString().slice(0, 10)}` : '');

      if (!finalTitle) throw new Error('Title is required');

      let finalLanguage = language;
      let finalGenreId = genre_id;

      if (!finalLanguage) {
        finalLanguage = shouldSaveDraft ? 'English' : null;
      }

      if (!finalGenreId && shouldSaveDraft) {
        const genres = await bookService.getGenres();
        const fiction =
          (genres || []).find((g) => String(g.slug || '').toLowerCase() === 'fiction') ||
          (genres || []).find((g) => String(g.name || '').toLowerCase() === 'fiction');
        finalGenreId = fiction?.id || genres?.[0]?.id || null;
      }

      if (!finalLanguage) throw new Error('Language is required');
      if (!finalGenreId) throw new Error('Genre is required');

      // Cover is required by DB schema, but for drafts we can auto-generate a placeholder
      let cover;
      if (req.files?.cover?.[0]) {
        cover = await fileUploadService.uploadCoverImage(req.files.cover[0], userId);
      } else if (shouldSaveDraft) {
        cover = await fileUploadService.uploadPlaceholderCover(userId);
      } else {
        throw new Error('Cover image is required');
      }

      const formats = await buildFormatsFromFiles(req, userId);

      if (!shouldSaveDraft && !shouldSubmitForReview && formats.length === 0) {
        throw new Error('At least one format (PDF or Audio) is required');
      }
      if (shouldSubmitForReview && formats.length === 0) {
        throw new Error('You must upload at least one format before submitting for review');
      }

      const {
        finalAuthorName,
        finalAuthorUserId,
        finalPublisherName,
        finalPublisherUserId,
      } = await resolveRoleAssociations(req, userRole, userId);

      const bookData = {
        title: finalTitle,
        subtitle: subtitle || null,
        description: description || null,
        language: finalLanguage,
        publication_date: publication_date || null,
        genre_id: finalGenreId,
        author_name: finalAuthorName,
        author_user_id: finalAuthorUserId,
        publisher_name: finalPublisherName,
        publisher_user_id: finalPublisherUserId,
        cover_image_path: cover.path,
        cover_image_url: cover.url,
        formats,
        status: targetStatus,
      };

      const book = await bookService.createBook(bookData, userId, userRole);

      logger.info('Book uploaded successfully', { bookId: book.id, userId });

      res.status(201).json(formatSuccess(book, targetStatus === 'draft' ? 'Draft saved successfully' : 'Book submitted for review'));
    } catch (error) {
      logger.error('Upload book error', { error: error.message });
      if (error.name === 'ConflictError' || error instanceof ConflictError) {
        return res.status(409).json({
          success: false,
          error: {
            message: error.message,
            code: 'DUPLICATE_BOOK',
            ...(error.existingBookId && { existingBookId: error.existingBookId }),
          },
        });
      }
      next(error);
    }
  },

  async updateUploadedBook(req, res, next) {
    try {
      const bookId = req.params.id;
      const userId = req.user.id;
      const userRole = req.user.role;

      if (userRole !== 'author' && userRole !== 'publisher') {
        return res.status(403).json({
          success: false,
          error: { message: 'Only authors and publishers can update books' },
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
        save_as_draft,
        submit_for_review,
      } = req.body;

      const shouldSaveDraft = String(save_as_draft || '').toLowerCase() === 'true';
      const shouldSubmitForReview = String(submit_for_review || '').toLowerCase() === 'true';

      const bookUpdates = {};
      if (title !== undefined) bookUpdates.title = String(title).trim();
      if (subtitle !== undefined) bookUpdates.subtitle = subtitle || null;
      if (description !== undefined) bookUpdates.description = description || null;
      if (language !== undefined) bookUpdates.language = language;
      if (publication_date !== undefined) bookUpdates.publication_date = publication_date || null;
      if (genre_id !== undefined) bookUpdates.genre_id = genre_id;

      if (req.files?.cover?.[0]) {
        const cover = await fileUploadService.uploadCoverImage(req.files.cover[0], userId);
        bookUpdates.cover_image_path = cover.path;
        bookUpdates.cover_image_url = cover.url;
      }

      const {
        finalAuthorName,
        finalAuthorUserId,
        finalPublisherName,
        finalPublisherUserId,
      } = await resolveRoleAssociations(req, userRole, userId);

      if (userRole === 'author') {
        bookUpdates.author_name = finalAuthorName;
        bookUpdates.author_user_id = finalAuthorUserId;
        if (publisher_name !== undefined || publisher_user_id !== undefined) {
          bookUpdates.publisher_name = finalPublisherName;
          bookUpdates.publisher_user_id = finalPublisherUserId;
        }
      } else {
        bookUpdates.publisher_name = finalPublisherName;
        bookUpdates.publisher_user_id = finalPublisherUserId;
        if (author_name !== undefined || author_user_id !== undefined) {
          bookUpdates.author_name = finalAuthorName;
          bookUpdates.author_user_id = finalAuthorUserId;
        }
      }

      if (shouldSubmitForReview) {
        bookUpdates.status = 'pending_review';
      } else if (shouldSaveDraft) {
        bookUpdates.status = 'draft';
      }

      const formatUpdates = await buildFormatsFromFiles(req, userId);

      const book = await bookService.updateBookFromUpload(
        bookId,
        userId,
        bookUpdates,
        formatUpdates
      );

      const { pdf_price, audio_price } = req.body;
      if (!req.files?.pdf?.[0] && pdf_price !== undefined && pdf_price !== '') {
        await bookRepository.updateFormatPrice(bookId, userId, 'PDF', parseFloat(pdf_price) || 0);
      }
      if (!req.files?.audio?.[0] && audio_price !== undefined && audio_price !== '') {
        await bookRepository.updateFormatPrice(bookId, userId, 'Audio', parseFloat(audio_price) || 0);
      }

      res.status(200).json(
        formatSuccess(book, shouldSubmitForReview ? 'Book updated and submitted for review' : 'Book updated successfully')
      );
    } catch (error) {
      logger.error('Update uploaded book error', { error: error.message });
      if (error instanceof ConflictError) {
        return res.status(409).json({
          success: false,
          error: {
            message: error.message,
            code: 'DUPLICATE_BOOK',
            ...(error.existingBookId && { existingBookId: error.existingBookId }),
          },
        });
      }
      next(error);
    }
  },

  async addBookFormat(req, res, next) {
    try {
      const bookId = req.params.id;
      const userId = req.user.id;
      const userRole = req.user.role;

      if (userRole !== 'author' && userRole !== 'publisher') {
        return res.status(403).json({
          success: false,
          error: { message: 'Only authors and publishers can add formats' },
        });
      }

      const formats = await buildFormatsFromFiles(req, userId);
      if (formats.length !== 1) {
        throw new Error('Upload exactly one format file (PDF or Audio)');
      }

      const format = await bookService.addBookFormat(bookId, userId, formats[0]);

      res.status(201).json(formatSuccess(format, 'Format added successfully'));
    } catch (error) {
      logger.error('Add book format error', { error: error.message });
      if (error instanceof ConflictError) {
        return res.status(409).json({
          success: false,
          error: {
            message: error.message,
            code: 'DUPLICATE_BOOK',
            ...(error.existingBookId && { existingBookId: error.existingBookId }),
          },
        });
      }
      next(error);
    }
  },
};