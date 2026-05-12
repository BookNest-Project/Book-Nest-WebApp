import { libraryRepository } from '../repositories/libraryRepository.js';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const libraryService = {
  async getUserLibrary(userId) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    const { library, error } = await libraryRepository.getUserLibrary(userId);
    
    if (error) {
      throw new Error(error);
    }

    return library;
  },

  async hasPurchased(userId, bookFormatId) {
    if (!userId || !bookFormatId) {
      return false;
    }

    const { hasPurchased, error } = await libraryRepository.hasPurchased(userId, bookFormatId);
    
    if (error) {
      logger.error('Has purchased check error', { userId, bookFormatId, error });
      return false;
    }

    return hasPurchased;
  },
};