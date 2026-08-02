export const ORDER_STATUS_FILTER_OPTIONS = [
  { value: "For Layaway Approval", label: "For Layaway Approval" },
  { value: "For Credit Line Approval", label: "For Credit Line Approval" },
  { value: "For Payment", label: "For Payment" },
  { value: "Paid", label: "Paid" },
  { value: "For pick-up", label: "For pick-up" },
  { value: "Item Received", label: "Item Received" },
  { value: "Item Received - Unpaid", label: "Item Received - Unpaid" },
  { value: "Item Received - Paid", label: "Item Received - Paid" },
  { value: "Expired", label: "Expired" },
  { value: "Declined", label: "Declined" },
  { value: "Cancelled", label: "Cancelled" },
  { value: "Reservation", label: "Reservation" },
];

export type OrderPaymentType = "full_payment" | "layaway" | "credit_line";

export function orderPaymentTypeOptions(isCreditLine: boolean): Array<{
  value: OrderPaymentType;
  label: string;
}> {
  const options: Array<{ value: OrderPaymentType; label: string }> = [
    { value: "full_payment", label: "Full payment" },
    { value: "layaway", label: "Layaway" },
  ];
  if (isCreditLine) {
    options.push({ value: "credit_line", label: "Credit Line" });
  }
  return options;
}

export function isInstallmentPaymentType(paymentType: string): boolean {
  return paymentType === "layaway" || paymentType === "credit_line";
}

export function isInstallmentApprovalStatus(status: string): boolean {
  const key = status.trim().toLowerCase();
  return key === "for layaway approval" || key === "for credit line approval";
}

export function isFullPaymentLike(paymentType: string): boolean {
  return paymentType === "full_payment";
}

export function isItemReceivedOrderStatus(status: string): boolean {
  const key = status.trim().toLowerCase();
  return (
    key === "item received" ||
    key === "item received - unpaid" ||
    key === "item received - paid"
  );
}

function paymentTypeLabel(paymentType: string): string {
  if (paymentType === "full_payment") return "Full payment";
  if (paymentType === "layaway") return "Layaway";
  if (paymentType === "credit_line") return "Credit Line";
  return paymentType;
}

export { paymentTypeLabel };
