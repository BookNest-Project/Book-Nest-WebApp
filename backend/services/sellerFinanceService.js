import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { sendWithdrawalEmail } from './emailService.js';

const PLATFORM_FEE_PERCENT = parseFloat(process.env.PLATFORM_FEE_PERCENT || '15', 10);

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

export const sellerFinanceService = {
  getPlatformFeePercent() {
    return PLATFORM_FEE_PERCENT;
  },

  /**
   * Credit seller after a completed sale line item.
   */
  async recordEarningForLineItem(transactionId, bookFormatId, grossAmount) {
    const gross = parseFloat(grossAmount) || 0;
    if (gross <= 0) return;

    const { data: existing } = await supabaseAdmin
      .from('seller_earnings')
      .select('id')
      .eq('transaction_id', transactionId)
      .eq('book_format_id', bookFormatId)
      .maybeSingle();

    if (existing) return;

    const { data: format } = await supabaseAdmin
      .from('book_formats')
      .select('book_id, book:books!inner(uploaded_by)')
      .eq('id', bookFormatId)
      .single();

    const sellerId = format?.book?.uploaded_by;
    if (!sellerId) return;

    const platformFee = roundMoney(gross * (PLATFORM_FEE_PERCENT / 100));
    const netAmount = roundMoney(gross - platformFee);

    const { error: earnError } = await supabaseAdmin.from('seller_earnings').insert({
      seller_id: sellerId,
      transaction_id: transactionId,
      book_format_id: bookFormatId,
      gross_amount: gross,
      platform_fee: platformFee,
      net_amount: netAmount,
    });

    if (earnError) {
      logger.error('seller_earnings insert failed', { error: earnError.message });
      return;
    }

    const { data: wallet } = await supabaseAdmin
      .from('seller_wallets')
      .select('available_balance')
      .eq('user_id', sellerId)
      .maybeSingle();

    if (wallet) {
      await supabaseAdmin
        .from('seller_wallets')
        .update({
          available_balance: roundMoney(parseFloat(wallet.available_balance) + netAmount),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', sellerId);
    } else {
      await supabaseAdmin.from('seller_wallets').insert({
        user_id: sellerId,
        available_balance: netAmount,
        pending_balance: 0,
        currency: 'ETB',
      });
    }

    logger.info('Seller earning recorded', { sellerId, netAmount, transactionId });
  },

  async getWallet(userId) {
    const { data, error } = await supabaseAdmin
      .from('seller_wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    return (
      data || {
        user_id: userId,
        available_balance: 0,
        pending_balance: 0,
        currency: 'ETB',
      }
    );
  },

  async getEarnings(userId, { limit = 50, offset = 0 } = {}) {
    const { data, error } = await supabaseAdmin
      .from('seller_earnings')
      .select(
        `
        id, gross_amount, platform_fee, net_amount, created_at,
        book_format:book_formats(format_type, book:books(title))
      `
      )
      .eq('seller_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data || [];
  },

  async getEarningsSummary(userId) {
    const { data, error } = await supabaseAdmin
      .from('seller_earnings')
      .select('gross_amount, platform_fee, net_amount')
      .eq('seller_id', userId);

    if (error) throw error;

    const rows = data || [];
    const gross_sales = roundMoney(
      rows.reduce((s, r) => s + parseFloat(r.gross_amount || 0), 0)
    );
    const platform_fees = roundMoney(
      rows.reduce((s, r) => s + parseFloat(r.platform_fee || 0), 0)
    );
    const net_earnings = roundMoney(
      rows.reduce((s, r) => s + parseFloat(r.net_amount || 0), 0)
    );

    const wallet = await this.getWallet(userId);

    return {
      gross_sales,
      platform_fees,
      net_earnings,
      platform_fee_percent: PLATFORM_FEE_PERCENT,
      available_balance: parseFloat(wallet.available_balance) || 0,
      pending_withdrawal: parseFloat(wallet.pending_balance) || 0,
      currency: wallet.currency || 'ETB',
      sale_count: rows.length,
    };
  },

  async getWithdrawals(userId) {
    const { data, error } = await supabaseAdmin
      .from('withdrawal_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async requestWithdrawal(userId, userEmail, { amount, payout_details }) {
    const wallet = await this.getWallet(userId);
    const available = parseFloat(wallet.available_balance) || 0;
    const reqAmount = parseFloat(amount);

    if (reqAmount <= 0) {
      const err = new Error('Amount must be greater than zero');
      err.statusCode = 400;
      throw err;
    }
    if (reqAmount > available) {
      const err = new Error('Insufficient available balance');
      err.statusCode = 400;
      throw err;
    }

    const { data: withdrawal, error } = await supabaseAdmin
      .from('withdrawal_requests')
      .insert({
        user_id: userId,
        amount: reqAmount,
        currency: wallet.currency || 'ETB',
        status: 'pending',
        payout_details,
      })
      .select()
      .single();

    if (error) throw error;

    await supabaseAdmin
      .from('seller_wallets')
      .update({
        available_balance: roundMoney(available - reqAmount),
        pending_balance: roundMoney(parseFloat(wallet.pending_balance || 0) + reqAmount),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (userEmail) {
      await sendWithdrawalEmail(userEmail, {
        status: 'pending',
        amount: reqAmount,
        currency: wallet.currency || 'ETB',
      });
    }

    return withdrawal;
  },
};
