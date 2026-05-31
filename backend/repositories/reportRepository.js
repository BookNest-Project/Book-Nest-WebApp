import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

const VALID_REASONS = new Set([
  'Spam or misleading',
  'Harassment or hate speech',
  'Abusive content',
  'Sexual content',
  'Racist content',
  'Inappropriate content',
  'Copyright violation',
  'Other',
]);

export const reportRepository = {
  async createReport(reporterId, { target_type, target_id, reason, details }) {
    if (!['post', 'comment', 'user'].includes(target_type)) {
      throw new Error('Invalid report target type');
    }
    if (!VALID_REASONS.has(reason)) {
      throw new Error('Invalid report reason');
    }

    const { data, error } = await supabaseAdmin
      .from('reports')
      .insert({
        reporter_id: reporterId,
        target_type,
        target_id,
        reason,
        details: details?.trim() || null,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        const err = new Error('You already reported this content');
        err.statusCode = 409;
        throw err;
      }
      logger.error('Create report error', { error: error.message });
      throw error;
    }

    return data;
  },
};
