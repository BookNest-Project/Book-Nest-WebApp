/** @see frontend/packages/validation/src/payout.ts — keep patterns in sync */

export const PAYOUT_METHODS = ['cbe', 'abyssinia', 'telebirr'];

const CBE_ACCOUNT_PATTERN = /^\d{10,13}$/;
const ABYSSINIA_ACCOUNT_PATTERN = /^\d{13}$/;
const TELEBIRR_PHONE_PATTERN = /^09\d{8}$/;

function normalizeDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

export function normalizeEthiopianMobile(value) {
  const digits = normalizeDigits(value);
  if (!digits) return null;

  if (digits.length === 10 && digits.startsWith('09')) return digits;
  if (digits.length === 12 && digits.startsWith('2519')) return `0${digits.slice(3)}`;
  if (digits.length === 9 && digits.startsWith('9')) return `0${digits}`;

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
      return { ok: false, message: 'CBE account must be 10–13 digits (numbers only).' };
    }
    return {
      ok: true,
      data: { payment_method: 'cbe', account_name: accountName, account_number: digits },
    };
  }

  if (method === 'abyssinia') {
    const digits = normalizeDigits(input.account_number);
    if (!ABYSSINIA_ACCOUNT_PATTERN.test(digits)) {
      return { ok: false, message: 'Bank of Abyssinia account must be exactly 13 digits.' };
    }
    return {
      ok: true,
      data: { payment_method: 'abyssinia', account_name: accountName, account_number: digits },
    };
  }

  const normalized = normalizeEthiopianMobile(input.telebirr_phone ?? input.mobile_money);
  if (!normalized || !TELEBIRR_PHONE_PATTERN.test(normalized)) {
    return {
      ok: false,
      message: 'Telebirr number must be a valid Ethio Telecom mobile (e.g. 0912345678).',
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
