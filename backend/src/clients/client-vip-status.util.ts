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

export function clientVipStatusRank(status: ClientVipStatus): number {
  if (status === 'Diamond') return 2;
  if (status === 'Gold') return 1;
  return 0;
}

/** VIP tier from cumulative purchases + consignments (whole PHP pesos). */
export function deriveClientVipStatus(
  combinedPesos: number,
  goldThreshold: number,
  diamondThreshold: number,
): ClientVipStatus {
  const combined = Number.isFinite(combinedPesos) ? combinedPesos : 0;
  const diamond = Number.isFinite(diamondThreshold)
    ? diamondThreshold
    : Number.POSITIVE_INFINITY;
  const gold = Number.isFinite(goldThreshold)
    ? goldThreshold
    : Number.POSITIVE_INFINITY;
  if (combined >= diamond) return 'Diamond';
  if (combined >= gold) return 'Gold';
  return 'Regular';
}
