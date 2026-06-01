import { adminSettingsService } from '../services/adminSettingsService.js';
import { formatSuccess } from '../utils/responseFormatter.js';

export async function getAdminSettings(req, res, next) {
  try {
    const data = await adminSettingsService.getPlatformSettings();
    res.status(200).json(formatSuccess(data, 'Settings retrieved'));
  } catch (error) {
    next(error);
  }
}

export async function updateAdminSettings(req, res, next) {
  try {
    const data = await adminSettingsService.updatePlatformSettings(req.body, req.user?.id);
    res.status(200).json(formatSuccess(data, 'Settings saved'));
  } catch (error) {
    next(error);
  }
}
