import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

const REVENUE_KEY = 'revenue';
const DEFAULT_COMMISSION = 20;

export const platformSettingsRepository = {
  async getCommissionPercent() {
    try {
      const { adminSettingsRepository } = await import('./adminSettingsRepository.js');
      const { settings } = await adminSettingsRepository.getSettings();
      const pct = Number(settings?.revenue?.commission_percent);
      if (Number.isFinite(pct) && pct >= 0 && pct <= 100) return pct;
    } catch {
      /* fall through */
    }

    const { data, error } = await supabaseAdmin
      .from('platform_settings')
      .select('value')
      .eq('key', REVENUE_KEY)
      .maybeSingle();

    if (error) {
      if (error.message?.includes('platform_settings')) {
        return DEFAULT_COMMISSION;
      }
      logger.warn('getCommissionPercent', { error: error.message });
      return DEFAULT_COMMISSION;
    }

    const pct = Number(data?.value?.commission_percent);
    return Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : DEFAULT_COMMISSION;
  },

  async setCommissionPercent(percent, adminId = null) {
    const safe = Math.min(100, Math.max(0, Number(percent)));
    const { data, error } = await supabaseAdmin
      .from('platform_settings')
      .upsert({
        key: REVENUE_KEY,
        value: { commission_percent: safe },
        updated_at: new Date().toISOString(),
        updated_by_admin_id: adminId,
      })
      .select('value, updated_at')
      .single();

    if (error) throw error;
    return { commissionPercent: safe, updatedAt: data.updated_at };
  },
};
