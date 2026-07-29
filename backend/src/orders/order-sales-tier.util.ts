import {
  ORDER_STATUS_ITEM_RECEIVED,
  ORDER_STATUS_ITEM_RECEIVED_PAID,
  ORDER_STATUS_ITEM_RECEIVED_UNPAID,
} from './order-status.constants';

export type SalesPriceTierKey =
  | 'below40k'
  | 'tier40k799k'
  | 'tier80k199k'
  | 'tier200kPlus';

export type DailySalesByTierRow = {
  day: string;
  below40k: number;
  tier40k799k: number;
  tier80k199k: number;
  tier200kPlus: number;
};

export function isSoldOrderStatus(status: string): boolean {
  return (
    status === ORDER_STATUS_ITEM_RECEIVED ||
    status === ORDER_STATUS_ITEM_RECEIVED_UNPAID ||
    status === ORDER_STATUS_ITEM_RECEIVED_PAID
  );
}

/** Bucket item unit price (TBH effective list price) for dashboard tiers. */
export function salesPriceTierKey(
  unitPrice: number,
): SalesPriceTierKey | null {
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return null;
  if (unitPrice < 40_000) return 'below40k';
  if (unitPrice < 80_000) return 'tier40k799k';
  if (unitPrice < 200_000) return 'tier80k199k';
  return 'tier200kPlus';
}

export function emptyDailySalesByTierRow(day: string): DailySalesByTierRow {
  return {
    day,
    below40k: 0,
    tier40k799k: 0,
    tier80k199k: 0,
    tier200kPlus: 0,
  };
}

const Y_AXIS_STEP = 200_000;

export function suggestDailySalesYAxisMax(maxBarValue: number): number {
  if (!Number.isFinite(maxBarValue) || maxBarValue <= 0) {
    return Y_AXIS_STEP;
  }
  return Math.ceil(maxBarValue / Y_AXIS_STEP) * Y_AXIS_STEP;
}
