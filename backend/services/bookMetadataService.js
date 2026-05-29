import { PDFDocument } from 'pdf-lib';
import { parseBuffer } from 'music-metadata';
import { logger } from '../utils/logger.js';

export const bookMetadataService = {
  async getPdfPageCount(buffer) {
    try {
      const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
      return pdf.getPageCount();
    } catch (error) {
      logger.warn('Failed to detect PDF page count', { error: error?.message });
      return null;
    }
  },

  async getAudioDurationSeconds(buffer, mimeType) {
    try {
      const metadata = await parseBuffer(buffer, { mimeType });
      const duration = metadata?.format?.duration;
      if (typeof duration !== 'number' || !Number.isFinite(duration)) return null;
      return Math.max(1, Math.round(duration));
    } catch (error) {
      logger.warn('Failed to detect audio duration', { error: error?.message });
      return null;
    }
  },
};

