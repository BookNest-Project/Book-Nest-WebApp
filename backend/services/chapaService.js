import { logger } from '../utils/logger.js';

const CHAPA_API_URL = 'https://api.chapa.co/v1';
const CHAPA_SECRET_KEY = process.env.CHAPA_SECRET_KEY;

export const chapaService = {
  async initializePayment(transaction, user, returnUrl) {
    try {
      const tx_ref = `booknest-${transaction.transaction_number}-${Date.now()}`;

      const payload = {
  amount: transaction.amount,
  currency: transaction.currency || 'ETB',
  email: user.email,
  first_name: user.publicName?.split(' ')[0] || 'Customer',
  last_name: user.publicName?.split(' ').slice(1).join(' ') || 'User',
  tx_ref: tx_ref,
  return_url: `${process.env.FRONTEND_URL}/checkout/result?tx_ref=${tx_ref}`,
  callback_url: `${process.env.BACKEND_URL}/api/webhooks/chapa`,
};

      logger.info('Chapa payment request', { tx_ref, amount: transaction.amount });

      const response = await fetch(`${CHAPA_API_URL}/transaction/initialize`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CHAPA_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || data.status !== 'success') {
        logger.error('Chapa initialization error', { error: data });
        return { checkoutUrl: null, tx_ref: null, error: data.message || 'Payment initialization failed' };
      }

      return { checkoutUrl: data.data.checkout_url, tx_ref, error: null };
    } catch (error) {
      logger.error('Chapa service error', { error: error.message });
      return { checkoutUrl: null, tx_ref: null, error: error.message };
    }
  },

  async verifyPayment(tx_ref) {
    try {
      const response = await fetch(`${CHAPA_API_URL}/transaction/verify/${tx_ref}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${CHAPA_SECRET_KEY}`,
        },
      });

      const data = await response.json();

      if (!response.ok || data.status !== 'success') {
        logger.error('Chapa verification error', { tx_ref, response: data });
        return { verified: false, data: null, error: data.message || 'Payment verification failed' };
      }

      return { verified: true, data: data.data, error: null };
    } catch (error) {
      logger.error('Chapa verification service error', { error: error.message });
      return { verified: false, data: null, error: error.message };
    }
  },
};