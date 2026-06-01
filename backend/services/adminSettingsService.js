import { adminSettingsRepository, DEFAULT_ADMIN_SETTINGS } from '../repositories/adminSettingsRepository.js';
import { recordAdminTask } from '../utils/adminTaskLogger.js';

export const adminSettingsService = {
  async getPlatformSettings() {
    const { settings, updatedAt, updatedBy } = await adminSettingsRepository.getSettings();
    return {
      settings,
      meta: { updatedAt, updatedBy, defaults: DEFAULT_ADMIN_SETTINGS },
    };
  },

  async updatePlatformSettings(patch, adminId) {
    const result = await adminSettingsRepository.updateSettings(patch, adminId);
    await recordAdminTask({
      adminId,
      category: 'settings',
      action: 'settings_updated',
      details: { patch },
    });
    return {
      settings: result.settings,
      meta: { updatedAt: result.updatedAt },
    };
  },
};
