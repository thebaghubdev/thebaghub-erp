export type OfferTransactionType = "consignment" | "direct_purchase" | null;

export function formatOfferTransactionLabel(
  t: OfferTransactionType | undefined,
): string {
  if (t === "direct_purchase") return "Direct purchase";
  if (t === "consignment") return "Consignment";
  return "—";
}
