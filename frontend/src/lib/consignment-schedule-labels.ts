export type ScheduleKind = "delivery" | "pullout";

export type BranchCode = "pasig" | "makati" | "authentication" | "studio";

export const LOGISTICS_BRANCH_OPTIONS: { value: BranchCode; label: string }[] =
  [
    { value: "pasig", label: "Pasig" },
    { value: "makati", label: "Makati" },
    { value: "authentication", label: "Authentication" },
    { value: "studio", label: "Studio" },
  ];

export const DELIVERY_MODE_OPTIONS = [
  { value: "pickup_service", label: "Pickup Service" },
  { value: "courier", label: "Courier" },
  { value: "consignor_dropoff", label: "Consignor Dropoff" },
] as const;

/** Client portal delivery scheduling options (subset labels). */
export const CLIENT_DELIVERY_MODE_OPTIONS = [
  { value: "courier", label: "Courier" },
  { value: "consignor_dropoff", label: "Drop-off at branch" },
  { value: "pickup_service", label: "Pick-up service" },
] as const;

export const PULLOUT_MODE_OPTIONS = [
  { value: "courier", label: "Courier" },
  { value: "consignor_pickup", label: "Consignor Pickup" },
] as const;

export function modeOfTransferLabel(
  scheduleType: string,
  modeCode: string,
): string {
  const list =
    scheduleType === "pullout" ? PULLOUT_MODE_OPTIONS : DELIVERY_MODE_OPTIONS;
  return list.find((m) => m.value === modeCode)?.label ?? modeCode;
}

export function branchLabel(branch: string): string {
  const code = branch.trim().toLowerCase();
  const match = LOGISTICS_BRANCH_OPTIONS.find((b) => b.value === code);
  if (match) return match.label;
  return branch.trim() || "—";
}

export function scheduleTypeLabel(scheduleType: string): string {
  return scheduleType === "pullout" ? "Pullout" : "Delivery";
}
