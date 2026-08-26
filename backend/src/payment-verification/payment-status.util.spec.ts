import {
  isPaymentAwaitingVerification,
  isPaymentConfirmed,
  PAYMENT_STATUS_CONFIRMED,
  PAYMENT_STATUS_FOR_VERIFICATION,
} from './payment-status.util';

describe('payment-status.util', () => {
  it('treats For payment verification and Pending as awaiting', () => {
    expect(isPaymentAwaitingVerification(PAYMENT_STATUS_FOR_VERIFICATION)).toBe(
      true,
    );
    expect(isPaymentAwaitingVerification('Pending')).toBe(true);
    expect(isPaymentAwaitingVerification(PAYMENT_STATUS_CONFIRMED)).toBe(false);
    expect(isPaymentAwaitingVerification(null)).toBe(false);
  });

  it('recognizes Confirmed status', () => {
    expect(isPaymentConfirmed(PAYMENT_STATUS_CONFIRMED)).toBe(true);
    expect(isPaymentConfirmed(PAYMENT_STATUS_FOR_VERIFICATION)).toBe(false);
  });
});
