import {
  ORDER_STATUS_FOR_CREDIT_LINE_APPROVAL,
  ORDER_STATUS_FOR_LAYAWAY_APPROVAL,
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

export function installmentApprovalStatusForPaymentType(
  paymentType: string,
): string {
  return paymentType === PAYMENT_TYPE_CREDIT_LINE
    ? ORDER_STATUS_FOR_CREDIT_LINE_APPROVAL
    : ORDER_STATUS_FOR_LAYAWAY_APPROVAL;
}

export function isInstallmentApprovalStatus(status: string): boolean {
  const key = status.trim().toLowerCase();
  return (
    key === ORDER_STATUS_FOR_LAYAWAY_APPROVAL.toLowerCase() ||
    key === ORDER_STATUS_FOR_CREDIT_LINE_APPROVAL.toLowerCase()
  );
}
