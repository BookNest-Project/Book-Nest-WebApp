import { userRepository } from '../repositories/userRepository.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';
import { formatSessionUser } from '../utils/responseFormatter.js';
import { fileUploadService } from './fileUploadService.js';
import { authService } from './authService.js';
import { saveAvatarToAuthMetadata } from '../utils/avatarMetadata.js';
import { logger } from '../utils/logger.js';

const BIO_MAX = 100;

function normalizeBio(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (trimmed.length > BIO_MAX) {
    throw new ValidationError(`Bio must be ${BIO_MAX} characters or less`);
  }
  return trimmed.length ? trimmed : null;
}

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
    if (display_name !== undefined) profileUpdates.display_name = display_name?.trim() || null;
    if (avatar_url !== undefined) profileUpdates.avatar_url = avatar_url || null;
    if (bio !== undefined) profileUpdates.bio = normalizeBio(bio);

    if (Object.keys(profileUpdates).length > 0) {
      await userRepository.upsertReaderProfile(userId, profileUpdates, dbUser.email);
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

  async uploadAvatar(userId, file) {
    const dbUser = await userRepository.findById(userId);
    if (!dbUser) {
      throw new NotFoundError('User');
    }
    if (dbUser.role === 'admin') {
      throw new ForbiddenError('Use the admin profile endpoint for admin accounts');
    }

    let existingProfile = null;
    switch (dbUser.role) {
      case 'reader':
        existingProfile = await userRepository.findReaderProfile(userId);
        break;
      case 'author':
        existingProfile = await userRepository.findAuthorProfile(userId);
        break;
      case 'publisher':
        existingProfile = await userRepository.findPublisherProfile(userId);
        break;
      default:
        throw new ForbiddenError('Profile photos are not supported for this account type');
    }

    const previousAvatarUrl = existingProfile?.avatar_url || null;
    const upload = await fileUploadService.uploadAvatarImage(file, userId);

    await saveAvatarToAuthMetadata(userId, upload.url);
    await userRepository.upsertProfileAvatar(userId, dbUser.role, upload.url, dbUser.email);

    if (previousAvatarUrl && previousAvatarUrl !== upload.url) {
      const oldPath = fileUploadService.extractStoragePath(previousAvatarUrl);
      if (oldPath) {
        await fileUploadService.deleteFile(oldPath);
      }
    }

    const session = await authService.getUserSession(userId);

    logger.info('Profile avatar uploaded', { userId, role: dbUser.role });

    return {
      avatar_url: upload.url,
      session,
    };
  },

  async updateProfile(userId, updates) {
    const dbUser = await userRepository.findById(userId);
    if (!dbUser) {
      throw new NotFoundError('User');
    }

    if (dbUser.role === 'reader') {
      return this.updateReaderProfile(userId, updates);
    }

    if (dbUser.role === 'author') {
      const profileUpdates = {};
      if (updates.pen_name !== undefined) profileUpdates.pen_name = updates.pen_name?.trim() || null;
      if (updates.bio !== undefined) profileUpdates.bio = normalizeBio(updates.bio);
      if (updates.website_url !== undefined) profileUpdates.website_url = updates.website_url || null;
      if (Object.keys(profileUpdates).length > 0) {
        await userRepository.upsertAuthorProfile(userId, profileUpdates, dbUser.email);
      }
      const profile = await userRepository.findAuthorProfile(userId);
      return { profile };
    }

    if (dbUser.role === 'publisher') {
      const profileUpdates = {};
      if (updates.company_name !== undefined) {
        profileUpdates.company_name = updates.company_name?.trim() || null;
      }
      if (updates.bio !== undefined) profileUpdates.bio = normalizeBio(updates.bio);
      if (updates.website_url !== undefined) profileUpdates.website_url = updates.website_url || null;
      if (Object.keys(profileUpdates).length > 0) {
        await userRepository.upsertPublisherProfile(userId, profileUpdates, dbUser.email);
      }
      const profile = await userRepository.findPublisherProfile(userId);
      return { profile };
    }

    throw new ForbiddenError('Profile updates are not supported for this account type');
  },

  async formatProfileResponse(userId) {
    const { user, profile } = await this.getProfile(userId);
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      profile,
    };
  },
};