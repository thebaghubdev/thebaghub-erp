export type OfferTransactionType =
  | "consignment"
  | "direct_purchase"
  | "stock"
  | null;

export function formatOfferTransactionLabel(
  t: OfferTransactionType | string | undefined,
): string {
  if (t === "direct_purchase") return "Direct purchase";
  if (t === "consignment") return "Consignment";
  if (t === "stock") return "Stock";
  return "—";
}
