export const VOUCHER_STATUS_ACTIVE = 'active';
export const VOUCHER_STATUS_FORFEITED = 'forfeited';
export const VOUCHER_STATUS_REDEEMED = 'redeemed';

export type VoucherStatus =
  | typeof VOUCHER_STATUS_ACTIVE
  | typeof VOUCHER_STATUS_FORFEITED
  | typeof VOUCHER_STATUS_REDEEMED;
