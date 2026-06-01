import { supabaseAdmin } from '../config/supabase.js';
import { authService } from './authService.js';
import { fileUploadService } from './fileUploadService.js';
import { adminProfileRepository } from '../repositories/adminProfileRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import {
  mergeAuthProfileMetadata,
  saveAvatarToAuthMetadata,
} from '../utils/avatarMetadata.js';

async function saveProfileToAuthMetadata(userId, { displayName, bio }) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error) {
    logger.error('Auth user fetch failed', { userId, error: error.message });
    throw new Error('Failed to update profile');
  }

  const meta = data?.user?.user_metadata || {};
  const nextMeta = mergeAuthProfileMetadata(meta, { displayName, bio });

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
  if (trimmed.length > 100) {
    throw new ValidationError('Bio must be 100 characters or less');
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
    const previousAvatarUrl = existing?.avatar_url || null;
    const upload = await fileUploadService.uploadAvatarImage(file, userId);

    await saveAvatarToAuthMetadata(userId, upload.url);

    try {
      await adminProfileRepository.upsertAvatar(userId, {
        avatarUrl: upload.url,
        displayName: existing?.display_name || dbUser.email?.split('@')[0],
      });
    } catch (profileError) {
      logger.warn('admin_profiles avatar sync skipped', {
        userId,
        error: profileError.message,
      });
    }

    if (previousAvatarUrl && previousAvatarUrl !== upload.url) {
      const oldPath = fileUploadService.extractStoragePath(previousAvatarUrl);
      if (oldPath) {
        await fileUploadService.deleteFile(oldPath);
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

    try {
      const existing = await adminProfileRepository.findByUserId(userId);
      const { data: authData } = await supabaseAdmin.auth.admin.getUserById(userId);
      const authAvatar =
        authData?.user?.user_metadata?.avatar_url ||
        authData?.user?.user_metadata?.avatarUrl ||
        null;

      if (existing) {
        await adminProfileRepository.updateProfile(userId, {
          displayName: safeName,
          bio: safeBio,
        });
        if (authAvatar && !existing.avatar_url) {
          await adminProfileRepository.updateAvatar(userId, authAvatar);
        }
      } else {
        await adminProfileRepository.upsertProfile(userId, {
          displayName: safeName ?? dbUser.email?.split('@')[0],
          bio: safeBio ?? null,
        });
        if (authAvatar) {
          await adminProfileRepository.updateAvatar(userId, authAvatar);
        }
      }
    } catch (profileError) {
      logger.warn('admin_profiles profile sync skipped', {
        userId,
        error: profileError.message,
      });
    }

    const session = await authService.getUserSession(userId);
    if (safeName) session.user.publicName = safeName;
    if (safeBio !== undefined) session.user.bio = safeBio;
    return session;
  },
};
