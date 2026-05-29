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
    const body = req.body || {};
    const rawName = body.displayName ?? body.display_name;
    if (rawName === undefined || rawName === null || String(rawName).trim() === '') {
      throw new ValidationError('Display name is required');
    }
    const session = await adminProfileService.updateDisplayName(req.user.id, rawName);
    res.status(200).json(formatSuccess(session, 'Profile updated successfully'));
  } catch (error) {
    if (error.statusCode === 400 || error instanceof ValidationError) {
      error.statusCode = 400;
    }
    next(error);
  }
};
