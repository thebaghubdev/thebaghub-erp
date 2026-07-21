export function pickupOptionLabel(value: string | null | undefined): string {
  if (value === "store_pickup") return "Store pick-up";
  if (value === "courier_delivery") return "Courier delivery";
  if (value === "in_store_purchase") return "In-store purchase";
  return value?.trim() ? value : "—";
}

export function pickupBranchLabel(value: string | null | undefined): string {
  if (value === "makati") return "Makati";
  if (value === "pasig") return "Pasig";
  return value?.trim() ? value : "—";
}

export function courierServiceLabel(value: string | null | undefined): string {
  if (value === "lbc") return "LBC";
  if (value === "third_party") return "Third-party";
  return value?.trim() ? value : "—";
}

export function isForPickupOrderStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized === "for pick-up" || normalized === "out for delivery";
}
