import { supabaseAdmin } from '../config/supabase.js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
const ALLOWED_PDF_TYPES = ['application/pdf'];
const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a'];

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_PDF_SIZE = 50 * 1024 * 1024;  // 50MB
const MAX_AUDIO_SIZE = 200 * 1024 * 1024; // 200MB

export const fileUploadService = {
  /**
   * Upload a cover image
   */
  async uploadCoverImage(file, userId) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new Error('Invalid image type. Allowed: JPEG, PNG, WEBP');
    }
    if (file.size > MAX_IMAGE_SIZE) {
      throw new Error(`Image too large. Max size: ${MAX_IMAGE_SIZE / 1024 / 1024}MB`);
    }

    const fileExt = file.originalname.split('.').pop();
    const fileName = `${uuidv4()}.${fileExt}`;
    const filePath = `book-covers/${fileName}`;

    const { error } = await supabaseAdmin.storage
      .from('booknest')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
      });

    if (error) {
      logger.error('Cover upload error', { error: error.message });
      throw new Error('Failed to upload cover image');
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('booknest')
      .getPublicUrl(filePath);

    return {
      path: filePath,
      url: urlData.publicUrl,
    };
  },

  /**
   * Upload a PDF file
   */
  async uploadPdfFile(file, userId) {
    if (!ALLOWED_PDF_TYPES.includes(file.mimetype)) {
      throw new Error('Invalid file type. Allowed: PDF');
    }
    if (file.size > MAX_PDF_SIZE) {
      throw new Error(`PDF too large. Max size: ${MAX_PDF_SIZE / 1024 / 1024}MB`);
    }

    const fileName = `${uuidv4()}.pdf`;
    const filePath = `book-pdfs/${fileName}`;

    const { error } = await supabaseAdmin.storage
      .from('booknest')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
      });

    if (error) {
      logger.error('PDF upload error', { error: error.message });
      throw new Error('Failed to upload PDF file');
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('booknest')
      .getPublicUrl(filePath);

    return {
      path: filePath,
      url: urlData.publicUrl,
      size: file.size,
    };
  },

  /**
   * Upload an audio file
   */
  async uploadAudioFile(file, userId) {
    if (!ALLOWED_AUDIO_TYPES.includes(file.mimetype)) {
      throw new Error('Invalid audio type. Allowed: MP3, WAV, M4A');
    }
    if (file.size > MAX_AUDIO_SIZE) {
      throw new Error(`Audio too large. Max size: ${MAX_AUDIO_SIZE / 1024 / 1024}MB`);
    }

    const fileExt = file.originalname.split('.').pop();
    const fileName = `${uuidv4()}.${fileExt}`;
    const filePath = `book-audios/${fileName}`;

    const { error } = await supabaseAdmin.storage
      .from('booknest')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
      });

    if (error) {
      logger.error('Audio upload error', { error: error.message });
      throw new Error('Failed to upload audio file');
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('booknest')
      .getPublicUrl(filePath);

    return {
      path: filePath,
      url: urlData.publicUrl,
      size: file.size,
    };
  },

  /**
   * Delete a file from storage
   */
  async deleteFile(filePath) {
    if (!filePath) return;

    const { error } = await supabaseAdmin.storage
      .from('booknest')
      .remove([filePath]);

    if (error) {
      logger.error('File delete error', { filePath, error: error.message });
      // Don't throw, just log - we don't want to fail the whole operation
    }
  },
};