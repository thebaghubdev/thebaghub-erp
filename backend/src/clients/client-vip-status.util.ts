export type ClientVipStatus = 'Regular' | 'Gold' | 'Diamond';

export const CLIENT_VIP_STATUS_REGULAR: ClientVipStatus = 'Regular';

export const CLIENT_VIP_STATUSES: ClientVipStatus[] = [
  'Regular',
  'Gold',
  'Diamond',
];

export function normalizeClientVipStatus(
  raw: string | null | undefined,
): ClientVipStatus {
  if (raw === 'Gold' || raw === 'gold') return 'Gold';
  if (raw === 'Diamond' || raw === 'diamond') return 'Diamond';
  return 'Regular';
}
