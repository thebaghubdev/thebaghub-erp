import {
  PAYMENT_TYPE_CREDIT_LINE,
  PAYMENT_TYPE_LAYAWAY,
} from './order-status.constants';

export function isInstallmentPaymentType(paymentType: string): boolean {
  return (
    paymentType === PAYMENT_TYPE_LAYAWAY ||
    paymentType === PAYMENT_TYPE_CREDIT_LINE
  );
}

export function isCreditLinePaymentType(paymentType: string): boolean {
  return paymentType === PAYMENT_TYPE_CREDIT_LINE;
}
