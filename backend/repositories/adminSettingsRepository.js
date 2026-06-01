import { supabaseAdmin } from '../config/supabase.js';

export const ADMIN_SETTINGS_KEY = 'admin_console';

export const DEFAULT_ADMIN_SETTINGS = {
  revenue: {
    commission_percent: 20,
    currency: 'ETB',
    minimum_payout_amount: 100,
    tax_label: 'VAT',
    show_tax_in_reports: false,
  },
  books: {
    require_revenue_agreement: true,
    dual_format_review_required: true,
    max_audio_upload_mb: 500,
    max_pdf_upload_mb: 100,
    default_review_sla_days: 7,
    allow_author_pricing_updates: true,
  },
  notifications: {
    email_on_new_submission: true,
    email_on_sale: true,
    email_on_user_registration: false,
    email_on_book_rejected: true,
    in_app_notifications: true,
    digest_email_weekly: false,
  },
  reports: {
    default_range_days: 30,
    default_export_format: 'xlsx',
    auto_refresh_interval_sec: 0,
    show_operational_metrics: true,
  },
  platform: {
    maintenance_mode: false,
    support_email: '',
    marketplace_name: 'BookNest',
    allow_new_registrations: true,
    default_user_role: 'reader',
  },
  invitations: {
    default_expiry_days: 14,
    auto_send_on_create: false,
    reminder_before_expiry_days: 3,
  },
  payments: {
    primary_gateway: 'chapa',
    allow_mock_payments: false,
    refund_window_days: 7,
  },
};

function deepMerge(base, patch) {
  const out = { ...base };
  for (const key of Object.keys(patch || {})) {
    if (
      patch[key] &&
      typeof patch[key] === 'object' &&
      !Array.isArray(patch[key]) &&
      typeof base[key] === 'object' &&
      !Array.isArray(base[key])
    ) {
      out[key] = deepMerge(base[key], patch[key]);
    } else {
      out[key] = patch[key];
    }
  }
  return out;
}

export const adminSettingsRepository = {
  async getSettings() {
    const { data, error } = await supabaseAdmin
      .from('platform_settings')
      .select('value, updated_at, updated_by_admin_id')
      .eq('key', ADMIN_SETTINGS_KEY)
      .maybeSingle();

    if (error) {
      if (error.message?.includes('platform_settings')) {
        return { settings: { ...DEFAULT_ADMIN_SETTINGS }, updatedAt: null };
      }
      throw error;
    }

    let settings = deepMerge(DEFAULT_ADMIN_SETTINGS, data?.value || {});

    const { data: legacy } = await supabaseAdmin
      .from('platform_settings')
      .select('value')
      .eq('key', 'revenue')
      .maybeSingle();

    if (legacy?.value?.commission_percent != null && !data?.value?.revenue?.commission_percent) {
      settings = deepMerge(settings, {
        revenue: { commission_percent: legacy.value.commission_percent },
      });
    }

    return {
      settings,
      updatedAt: data?.updated_at ?? null,
      updatedBy: data?.updated_by_admin_id ?? null,
    };
  },

  async updateSettings(patch, adminId = null) {
    const current = await this.getSettings();
    const merged = deepMerge(current.settings, patch);

    const { data, error } = await supabaseAdmin
      .from('platform_settings')
      .upsert({
        key: ADMIN_SETTINGS_KEY,
        value: merged,
        updated_at: new Date().toISOString(),
        updated_by_admin_id: adminId,
      })
      .select('value, updated_at')
      .single();

    if (error) throw error;

    await supabaseAdmin.from('platform_settings').upsert({
      key: 'revenue',
      value: { commission_percent: merged.revenue.commission_percent },
      updated_at: new Date().toISOString(),
      updated_by_admin_id: adminId,
    });

    return { settings: data.value, updatedAt: data.updated_at };
  },
};
