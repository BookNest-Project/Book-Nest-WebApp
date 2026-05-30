import { supabaseAdmin } from '../config/supabase.js';
import { authService } from './authService.js';
import { fileUploadService } from './fileUploadService.js';
import { adminProfileRepository } from '../repositories/adminProfileRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

async function saveAvatarToAuthMetadata(userId, avatarUrl) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error) {
    logger.error('Auth user fetch failed', { userId, error: error.message });
    throw new Error('Failed to update profile photo');
  }

  const meta = data?.user?.user_metadata || {};
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...meta,
      avatar_url: avatarUrl,
    },
  });

  if (updateError) {
    logger.error('Auth metadata update failed', { userId, error: updateError.message });
    throw new Error('Failed to save profile photo');
  }
}

async function saveProfileToAuthMetadata(userId, { displayName, bio }) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error) {
    logger.error('Auth user fetch failed', { userId, error: error.message });
    throw new Error('Failed to update profile');
  }

  const meta = data?.user?.user_metadata || {};
  const nextMeta = { ...meta };

  if (displayName !== undefined) {
    nextMeta.display_name = displayName;
    nextMeta.displayName = displayName;
  }
  if (bio !== undefined) {
    nextMeta.bio = bio || null;
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: nextMeta,
  });

  if (updateError) {
    logger.error('Auth metadata profile update failed', { userId, error: updateError.message });
    throw new Error('Failed to save profile');
  }
}

function normalizeDisplayName(value) {
  const trimmed = (value || '').trim();
  if (trimmed.length < 2) {
    throw new ValidationError('Display name must be at least 2 characters');
  }
  if (trimmed.length > 80) {
    throw new ValidationError('Display name must be 80 characters or less');
  }
  return trimmed;
}

function normalizeBio(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (trimmed.length > 1000) {
    throw new ValidationError('Bio must be 1000 characters or less');
  }
  return trimmed.length ? trimmed : null;
}

export const adminProfileService = {
  async uploadAvatar(userId, file) {
    const dbUser = await userRepository.findById(userId);
    if (!dbUser) {
      throw new NotFoundError('User');
    }
    if (dbUser.role !== 'admin') {
      throw new ForbiddenError('Only admin accounts can update admin profile photos');
    }

    const existing = await adminProfileRepository.findByUserId(userId);
    const upload = await fileUploadService.uploadAvatarImage(file, userId);

    if (existing?.avatar_url) {
      const oldPath = fileUploadService.extractStoragePath(existing.avatar_url);
      if (oldPath) {
        await fileUploadService.deleteFile(oldPath);
      }
    }

    await saveAvatarToAuthMetadata(userId, upload.url);

    if (existing) {
      try {
        await adminProfileRepository.updateAvatar(userId, upload.url);
      } catch (profileError) {
        logger.warn('admin_profiles avatar sync skipped', {
          userId,
          error: profileError.message,
        });
      }
    }

    return authService.getUserSession(userId);
  },

  async updateDisplayName(userId, displayName) {
    return this.updateProfile(userId, { displayName });
  },

  async updateProfile(userId, { displayName, bio }) {
    const dbUser = await userRepository.findById(userId);
    if (!dbUser) {
      throw new NotFoundError('User');
    }
    if (dbUser.role !== 'admin') {
      throw new ForbiddenError('Only admin accounts can update admin profiles');
    }

    const hasName = displayName !== undefined && displayName !== null;
    const hasBio = bio !== undefined;

    if (!hasName && !hasBio) {
      throw new ValidationError('Nothing to update');
    }

    const safeName = hasName ? normalizeDisplayName(displayName) : undefined;
    const safeBio = hasBio ? normalizeBio(bio) : undefined;

    await saveProfileToAuthMetadata(userId, {
      displayName: safeName,
      bio: safeBio,
    });

    const existing = await adminProfileRepository.findByUserId(userId);
    if (existing) {
      try {
        await adminProfileRepository.updateProfile(userId, {
          displayName: safeName,
          bio: safeBio,
        });
      } catch (profileError) {
        if (safeName && safeBio !== undefined) {
          try {
            await adminProfileRepository.updateProfile(userId, { displayName: safeName });
          } catch (nameOnlyError) {
            logger.warn('admin_profiles profile sync skipped', {
              userId,
              error: nameOnlyError.message,
            });
          }
        } else {
          logger.warn('admin_profiles profile sync skipped', {
            userId,
            error: profileError.message,
          });
        }
      }
    }

    const session = await authService.getUserSession(userId);
    if (safeName) session.user.publicName = safeName;
    if (safeBio !== undefined) session.user.bio = safeBio;
    return session;
  },
};
