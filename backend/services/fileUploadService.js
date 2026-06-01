import { supabaseAdmin } from '../config/supabase.js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/svg+xml'];
const ALLOWED_PDF_TYPES = ['application/pdf'];
const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a'];

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_PDF_SIZE = 200 * 1024 * 1024;  // 200MB
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
   * Upload a placeholder cover image for drafts (SVG).
   */
  async uploadPlaceholderCover(userId) {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024" viewBox="0 0 768 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F5F1EB"/>
      <stop offset="1" stop-color="#E8E2D9"/>
    </linearGradient>
  </defs>
  <rect width="768" height="1024" fill="url(#bg)"/>
  <rect x="96" y="144" width="576" height="736" rx="24" fill="#FFFFFF" opacity="0.9"/>
  <text x="384" y="520" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" fill="#4A5568">
    BookNest Draft
  </text>
  <text x="384" y="572" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#8E735B">
    Add a cover before submitting
  </text>
</svg>`;

    const fileName = `${uuidv4()}.svg`;
    const filePath = `book-covers/${fileName}`;
    const buffer = Buffer.from(svg, 'utf-8');

    const { error } = await supabaseAdmin.storage
      .from('booknest')
      .upload(filePath, buffer, {
        contentType: 'image/svg+xml',
        cacheControl: '3600',
      });

    if (error) {
      logger.error('Placeholder cover upload error', { error: error.message });
      throw new Error('Failed to upload placeholder cover image');
    }

    const { data: urlData } = supabaseAdmin.storage.from('booknest').getPublicUrl(filePath);

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
      const message = (error.message || '').toLowerCase();
      if (message.includes('too large') || message.includes('maximum') || message.includes('exceeded')) {
        throw new Error(
          `PDF upload failed: ${error.message}. This can be a Supabase Storage per-file upload limit.`
        );
      }
      throw new Error(`Failed to upload PDF file: ${error.message}`);
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
   * Upload user avatar to booknest/avatars/
   */
  async uploadAvatar(file, userId) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new Error('Invalid image type. Allowed: JPEG, PNG, WEBP');
    }
    if (file.size > MAX_IMAGE_SIZE) {
      throw new Error(`Image too large. Max size: ${MAX_IMAGE_SIZE / 1024 / 1024}MB`);
    }

    const fileExt = file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${userId}-${uuidv4()}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    const { error } = await supabaseAdmin.storage
      .from('booknest')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      logger.error('Avatar upload error', { error: error.message, userId });
      throw new Error('Failed to upload avatar');
    }

    const { data: urlData } = supabaseAdmin.storage.from('booknest').getPublicUrl(filePath);

    return {
      path: filePath,
      url: urlData.publicUrl,
    };
  },

  /**
   * Upload extra profile gallery image to booknest/profile-photos/
   */
  async uploadProfilePhoto(file, userId) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new Error('Invalid image type. Allowed: JPEG, PNG, WEBP');
    }
    if (file.size > MAX_IMAGE_SIZE) {
      throw new Error(`Image too large. Max size: ${MAX_IMAGE_SIZE / 1024 / 1024}MB`);
    }

    const fileExt = file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${userId}-${uuidv4()}.${fileExt}`;
    const filePath = `profile-photos/${fileName}`;

    const { error } = await supabaseAdmin.storage
      .from('booknest')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      logger.error('Profile photo upload error', { error: error.message, userId });
      throw new Error('Failed to upload profile photo');
    }

    const { data: urlData } = supabaseAdmin.storage.from('booknest').getPublicUrl(filePath);

    return {
      path: filePath,
      url: urlData.publicUrl,
    };
  },

  /**
   * Upload community post image to booknest/post-images/
   */
  async uploadPostImage(file, userId) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new Error('Invalid image type. Allowed: JPEG, PNG, WEBP');
    }
    if (file.size > MAX_IMAGE_SIZE) {
      throw new Error(`Image too large. Max size: ${MAX_IMAGE_SIZE / 1024 / 1024}MB`);
    }

    const fileExt = file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${userId}-${uuidv4()}.${fileExt}`;
    const filePath = `post-images/${fileName}`;

    const { error } = await supabaseAdmin.storage
      .from('booknest')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
      });

    if (error) {
      logger.error('Post image upload error', { error: error.message, userId });
      throw new Error('Failed to upload post image');
    }

    const { data: urlData } = supabaseAdmin.storage.from('booknest').getPublicUrl(filePath);

    return {
      path: filePath,
      url: urlData.publicUrl,
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