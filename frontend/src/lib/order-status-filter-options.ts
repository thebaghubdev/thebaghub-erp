export const ORDER_STATUS_FILTER_OPTIONS = [
  { value: "For Layaway Approval", label: "For Layaway Approval" },
  { value: "For Payment", label: "For Payment" },
  { value: "Paid", label: "Paid" },
  { value: "For pick-up", label: "For pick-up" },
  { value: "Item Received", label: "Item Received" },
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
    options.push({ value: "credit_line", label: "Credit line" });
  }
  return options;
}

export function isFullPaymentLike(paymentType: string): boolean {
  return paymentType === "full_payment" || paymentType === "credit_line";
}

function paymentTypeLabel(paymentType: string): string {
  if (paymentType === "full_payment") return "Full payment";
  if (paymentType === "layaway") return "Layaway";
  if (paymentType === "credit_line") return "Credit line";
  return paymentType;
}

export { paymentTypeLabel };
