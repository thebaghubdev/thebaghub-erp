export type ClientPaymentMethod =
  | "check_pickup"
  | "cash_pickup"
  | "direct_deposit";

export type ClientPaymentBranch = "pasig" | "makati";

export function formatClientPaymentMethod(
  m: ClientPaymentMethod | null | undefined,
): string {
  if (m === "check_pickup") return "Check pickup";
  if (m === "cash_pickup") return "Cash pickup";
  if (m === "direct_deposit") return "Direct deposit";
  return "—";
}

export function parseClientPaymentMethod(
  value: string | null | undefined,
): ClientPaymentMethod | null {
  if (
    value === "check_pickup" ||
    value === "cash_pickup" ||
    value === "direct_deposit"
  ) {
    return value;
  }
  return null;
}

export function parseClientPaymentBranch(
  value: string | null | undefined,
): ClientPaymentBranch {
  return value === "makati" ? "makati" : "pasig";
}
