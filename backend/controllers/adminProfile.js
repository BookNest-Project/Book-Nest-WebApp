import { formatSuccess } from '../utils/responseFormatter.js';
import { adminProfileService } from '../services/adminProfileService.js';
import { ValidationError } from '../utils/errors.js';
export const uploadAdminAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      const err = new Error('Profile photo file is required');
      err.statusCode = 400;
      throw err;
    }

    const session = await adminProfileService.uploadAvatar(req.user.id, req.file);
    res.status(200).json(formatSuccess(session, 'Profile photo updated successfully'));
  } catch (error) {
    if (
      error.message?.includes('Invalid') ||
      error.message?.includes('too large') ||
      error.message?.includes('required') ||
      error.statusCode === 400
    ) {
      error.statusCode = 400;
    }
    next(error);
  }
};

export const updateAdminProfile = async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const rawName = body.displayName ?? body.display_name ?? body.name;
    const rawBio = body.bio;

    const hasName = rawName !== undefined && rawName !== null && String(rawName).trim() !== '';
    const hasBio = rawBio !== undefined;

    if (!hasName && !hasBio) {
      throw new ValidationError('Display name or bio is required');
    }

    const session = await adminProfileService.updateProfile(req.user.id, {
      displayName: hasName ? String(rawName).trim() : undefined,
      bio: hasBio ? rawBio : undefined,
    });
    res.status(200).json(formatSuccess(session, 'Profile updated successfully'));
  } catch (error) {
    if (error.statusCode === 400 || error instanceof ValidationError) {
      error.statusCode = 400;
    }
    next(error);
  }
};
