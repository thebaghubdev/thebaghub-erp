import {
  normalizeClientVipStatus,
  type ClientVipStatus,
} from './client-vip-status.util';

export type VipDiscountTier = Extract<ClientVipStatus, 'Gold' | 'Diamond'>;

export type VipDiscountTierSettings = {
  percent: number;
  capPhp: number;
};

export type VipDiscountSettings = {
  gold: VipDiscountTierSettings;
  diamond: VipDiscountTierSettings;
};

export const DEFAULT_VIP_DISCOUNT_SETTINGS: VipDiscountSettings = {
  gold: { percent: 3, capPhp: 3_000 },
  diamond: { percent: 5, capPhp: 5_000 },
};

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function vipDiscountTier(
  vipStatus: string | null | undefined,
): VipDiscountTier | null {
  const status = normalizeClientVipStatus(vipStatus);
  if (status === 'Gold' || status === 'Diamond') return status;
  return null;
}

/** min(percent of selling price, cap in PHP). */
export function computeVipDiscountAmount(
  sellingPrice: number,
  percent: number,
  capPhp: number,
): number {
  if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) return 0;
  const rate = Number.isFinite(percent) ? Math.max(0, percent) : 0;
  const percentOff = sellingPrice * (rate / 100);
  const cap =
    Number.isFinite(capPhp) && capPhp > 0 ? capPhp : Number.POSITIVE_INFINITY;
  return roundMoney(Math.min(percentOff, cap));
}

export function computeVipPrice(
  sellingPrice: number,
  percent: number,
  capPhp: number,
): number | null {
  if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) return null;
  const discount = computeVipDiscountAmount(sellingPrice, percent, capPhp);
  return roundMoney(Math.max(0, sellingPrice - discount));
}

export function vipPriceForStatus(
  sellingPrice: number,
  enableDiscount: boolean,
  vipStatus: string | null | undefined,
  settings: VipDiscountSettings,
): number | null {
  if (!enableDiscount) return null;
  const tier = vipDiscountTier(vipStatus);
  if (tier === 'Gold') {
    return computeVipPrice(
      sellingPrice,
      settings.gold.percent,
      settings.gold.capPhp,
    );
  }
  if (tier === 'Diamond') {
    return computeVipPrice(
      sellingPrice,
      settings.diamond.percent,
      settings.diamond.capPhp,
    );
  }
  return null;
}

export function formatVipPrice(value: number | null): string | null {
  return value != null ? value.toFixed(2) : null;
}
