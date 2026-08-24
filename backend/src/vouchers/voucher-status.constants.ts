export const VOUCHER_STATUS_ACTIVE = 'active';
export const VOUCHER_STATUS_FORFEITED = 'forfeited';
export const VOUCHER_STATUS_REDEEMED = 'redeemed';

/** Added to sequential voucher numbers so they start at 10001 (5 digits). */
export const VOUCHER_NUMBER_OFFSET = 10_000;

export type VoucherStatus =
  | typeof VOUCHER_STATUS_ACTIVE
  | typeof VOUCHER_STATUS_FORFEITED
  | typeof VOUCHER_STATUS_REDEEMED;
