import { supabaseAdmin } from '../config/supabase.js';
import { authService } from './authService.js';
import { fileUploadService } from './fileUploadService.js';
import { adminProfileRepository } from '../repositories/adminProfileRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

function displayNameFromUser(dbUser, existingProfile) {
  if (existingProfile?.display_name?.trim()) {
    return existingProfile.display_name.trim();
  }
  const fromEmail = dbUser.email?.split('@')[0]?.replace(/[._]/g, ' ') || '';
  return fromEmail.length >= 2 ? fromEmail.slice(0, 80) : 'Admin User';
}

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

async function saveDisplayNameToAuthMetadata(userId, displayName) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error) {
    logger.error('Auth user fetch failed', { userId, error: error.message });
    throw new Error('Failed to update display name');
  }

  const meta = data?.user?.user_metadata || {};
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...meta,
      display_name: displayName,
      displayName,
    },
  });

  if (updateError) {
    logger.error('Auth metadata display name update failed', { userId, error: updateError.message });
    throw new Error('Failed to save display name');
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
    const dbUser = await userRepository.findById(userId);
    if (!dbUser) {
      throw new NotFoundError('User');
    }
    if (dbUser.role !== 'admin') {
      throw new ForbiddenError('Only admin accounts can update admin profiles');
    }

    const safeName = normalizeDisplayName(displayName);

    await saveDisplayNameToAuthMetadata(userId, safeName);

    try {
      await adminProfileRepository.upsertDisplayName(userId, safeName);
    } catch (profileError) {
      logger.warn('admin_profiles display name upsert skipped', {
        userId,
        error: profileError.message,
      });
    }

    const session = await authService.getUserSession(userId);
    session.user.publicName = safeName;
    return session;
  },
};
