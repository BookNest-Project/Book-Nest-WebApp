import { ValidationError } from '../utils/errors.js';

export const validateBookQuery = (query) => {
  const errors = {};

  // Validate page
  if (query.page !== undefined) {
    const page = parseInt(query.page);
    if (isNaN(page) || page < 1) {
      errors.page = 'Page must be a positive number';
    }
  }

  // Validate limit
  if (query.limit !== undefined) {
    const limit = parseInt(query.limit);
    if (isNaN(limit) || limit < 1 || limit > 50) {
      errors.limit = 'Limit must be between 1 and 50';
    }
  }

  // Validate genreId (if provided, it should be a valid UUID format)
  if (query.genreId && query.genreId !== 'all') {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(query.genreId)) {
      errors.genreId = 'Invalid genre ID format';
    }
  }

  // Validate format
  if (query.format && !['PDF', 'Audio'].includes(query.format)) {
    errors.format = 'Format must be PDF or Audio';
  }

  // Validate search (max length)
  if (query.search && query.search.length > 100) {
    errors.search = 'Search query too long (max 100 characters)';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid query parameters', errors);
  }

  return true;
};

export const validateBookId = (id) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  if (!id || !uuidRegex.test(id)) {
    throw new ValidationError('Invalid book ID format');
  }
  
  return true;
};