export type ScheduleKind = "delivery" | "pullout";

export type BranchCode = "pasig" | "makati";

export const DELIVERY_MODE_OPTIONS = [
  { value: "pickup_service", label: "Pickup Service" },
  { value: "courier", label: "Courier" },
  { value: "consignor_dropoff", label: "Consignor Dropoff" },
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
  return branch.trim().toLowerCase() === "makati" ? "Makati" : "Pasig";
}

export function scheduleTypeLabel(scheduleType: string): string {
  return scheduleType === "pullout" ? "Pullout" : "Delivery";
}
