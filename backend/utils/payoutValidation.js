/** @see frontend/packages/validation/src/payout.ts — keep patterns in sync */

export const PAYOUT_METHODS = ['cbe', 'abyssinia', 'telebirr'];

const CBE_ACCOUNT_PATTERN = /^1000\d{9}$/;
const ABYSSINIA_ACCOUNT_PATTERN = /^\d{8}$|^\d{9}$/;
const TELEBIRR_INPUT_PATTERN = /^(09|2519|\+2519|\+2517)\d{8}$/;

function normalizeDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

export function normalizeTelebirrPhone(value) {
  const trimmed = String(value ?? '').trim();
  if (!TELEBIRR_INPUT_PATTERN.test(trimmed)) return null;

  const digits = normalizeDigits(trimmed);
  if (digits.length === 10 && digits.startsWith('09')) return digits;
  if (digits.length === 12 && digits.startsWith('2519')) return `0${digits.slice(3)}`;
  if (digits.length === 12 && digits.startsWith('2517')) return `0${digits.slice(3)}`;

  return null;
}

export function validatePayoutDetails(input) {
  const method = input?.payment_method;
  if (!method || !PAYOUT_METHODS.includes(method)) {
    return { ok: false, message: 'Select a payout method: CBE, Abyssinia, or Telebirr.' };
  }

  const accountName = String(input.account_name ?? '').trim();
  if (accountName.length < 2) {
    return { ok: false, message: 'Account holder name is required (at least 2 characters).' };
  }

  if (method === 'cbe') {
    const digits = normalizeDigits(input.account_number);
    if (!CBE_ACCOUNT_PATTERN.test(digits)) {
      return { ok: false, message: 'CBE account must be 13 digits and start with 1000.' };
    }
    return {
      ok: true,
      data: { payment_method: 'cbe', account_name: accountName, account_number: digits },
    };
  }

  if (method === 'abyssinia') {
    const digits = normalizeDigits(input.account_number);
    if (!ABYSSINIA_ACCOUNT_PATTERN.test(digits)) {
      return { ok: false, message: 'Bank of Abyssinia account must be 8 or 9 digits.' };
    }
    return {
      ok: true,
      data: { payment_method: 'abyssinia', account_name: accountName, account_number: digits },
    };
  }

  const normalized = normalizeTelebirrPhone(input.telebirr_phone ?? input.mobile_money);
  if (!normalized) {
    return {
      ok: false,
      message: 'Telebirr number must be a valid Ethiopian mobile (e.g. 0912345678).',
    };
  }

  return {
    ok: true,
    data: {
      payment_method: 'telebirr',
      account_name: accountName,
      telebirr_phone: normalized,
    },
  };
}
