import { userRepository } from '../repositories/userRepository.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
import { formatSessionUser } from '../utils/responseFormatter.js';
import { logger } from '../utils/logger.js';

export const profileService = {
  async getProfile(userId) {
    const dbUser = await userRepository.findById(userId);
    
    if (!dbUser) {
      throw new NotFoundError('User');
    }

    let profile = null;
    switch (dbUser.role) {
      case 'reader':
        profile = await userRepository.findReaderProfile(userId);
        break;
      case 'author':
        profile = await userRepository.findAuthorProfile(userId);
        break;
      case 'publisher':
        profile = await userRepository.findPublisherProfile(userId);
        break;
      case 'admin':
        profile = await userRepository.findAdminProfile(userId);
        break;
    }

    if (dbUser.role === 'reader') {
      const favoriteGenres = await userRepository.findFavoriteGenres(userId);
      if (profile) {
        profile.favorite_genres = favoriteGenres;
      }
    }

    return {
      user: formatSessionUser(dbUser, profile),
      profile,
    };
  },

  async updateReaderProfile(userId, updates) {
    const { display_name, avatar_url, bio, favorite_genre_ids } = updates;

    const dbUser = await userRepository.findById(userId);
    
    if (!dbUser) {
      throw new NotFoundError('User');
    }

    if (dbUser.role !== 'reader') {
      throw new ForbiddenError('Only reader profiles can be updated through this endpoint');
    }

    const profileUpdates = {};
    if (display_name !== undefined) profileUpdates.display_name = display_name;
    if (avatar_url !== undefined) profileUpdates.avatar_url = avatar_url || null;
    if (bio !== undefined) profileUpdates.bio = bio || null;

    if (Object.keys(profileUpdates).length > 0) {
      const updated = await userRepository.updateReaderProfile(userId, profileUpdates);
      if (!updated) {
        throw new Error('Failed to update profile');
      }
    }

    if (favorite_genre_ids !== undefined) {
      await userRepository.updateFavoriteGenres(userId, favorite_genre_ids);
    }

    const profile = await userRepository.findReaderProfile(userId);
    const favoriteGenres = await userRepository.findFavoriteGenres(userId);

    logger.info('Reader profile updated', { userId });

    return {
      profile: profile ? { ...profile, favorite_genres: favoriteGenres } : null,
    };
  },
};