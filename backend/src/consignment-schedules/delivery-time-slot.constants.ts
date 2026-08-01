export const DELIVERY_TIME_SLOT_VALUES = [
  'morning',
  'early_afternoon',
  'late_afternoon',
] as const;

export type DeliveryTimeSlot = (typeof DELIVERY_TIME_SLOT_VALUES)[number];

export function deliveryTimeSlotLabel(slot: string | null | undefined): string {
  if (slot === 'morning') return 'Morning (10:30AM-12NN)';
  if (slot === 'early_afternoon') return 'Early Afternoon (12NN-3PM)';
  if (slot === 'late_afternoon') return 'Late Afternoon (3PM-6PM)';
  return slot?.trim() || '—';
}
