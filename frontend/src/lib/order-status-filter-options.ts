export const ORDER_STATUS_FILTER_OPTIONS = [
  { value: "For Layaway Approval", label: "For Layaway Approval" },
  { value: "For Payment", label: "For Payment" },
  { value: "Paid", label: "Paid" },
  { value: "Expired", label: "Expired" },
  { value: "Declined", label: "Declined" },
  { value: "Cancelled", label: "Cancelled" },
];

function paymentTypeLabel(paymentType: string): string {
  if (paymentType === "full_payment") return "Full payment";
  if (paymentType === "layaway") return "Layaway";
  return paymentType;
}

export { paymentTypeLabel };
