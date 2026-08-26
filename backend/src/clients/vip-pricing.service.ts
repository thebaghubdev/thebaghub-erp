import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import {
  VIP_DIAMOND_DISCOUNT_CAP_PHP_KEY,
  VIP_DIAMOND_DISCOUNT_PERCENT_KEY,
  VIP_GOLD_DISCOUNT_CAP_PHP_KEY,
  VIP_GOLD_DISCOUNT_PERCENT_KEY,
} from '../settings/consignment-setting-keys';
import {
  DEFAULT_VIP_DISCOUNT_SETTINGS,
  computeVipPrice,
  formatVipPrice,
  vipDiscountTier,
  vipPriceForStatus,
  type VipDiscountSettings,
  type VipDiscountTier,
} from './vip-discount.util';

@Injectable()
export class VipPricingService {
  constructor(private readonly settings: SettingsService) {}

  async loadSettings(): Promise<VipDiscountSettings> {
    const [goldPercent, goldCap, diamondPercent, diamondCap] =
      await Promise.all([
        this.settings.getNumericValue(
          VIP_GOLD_DISCOUNT_PERCENT_KEY,
          DEFAULT_VIP_DISCOUNT_SETTINGS.gold.percent,
        ),
        this.settings.getNumericValue(
          VIP_GOLD_DISCOUNT_CAP_PHP_KEY,
          DEFAULT_VIP_DISCOUNT_SETTINGS.gold.capPhp,
        ),
        this.settings.getNumericValue(
          VIP_DIAMOND_DISCOUNT_PERCENT_KEY,
          DEFAULT_VIP_DISCOUNT_SETTINGS.diamond.percent,
        ),
        this.settings.getNumericValue(
          VIP_DIAMOND_DISCOUNT_CAP_PHP_KEY,
          DEFAULT_VIP_DISCOUNT_SETTINGS.diamond.capPhp,
        ),
      ]);
    return {
      gold: { percent: goldPercent, capPhp: goldCap },
      diamond: { percent: diamondPercent, capPhp: diamondCap },
    };
  }

  priceForClient(
    sellingPrice: number | null,
    enableDiscount: boolean,
    vipStatus: string | null | undefined,
    settings: VipDiscountSettings,
  ): number | null {
    if (sellingPrice == null) return null;
    return vipPriceForStatus(
      sellingPrice,
      enableDiscount,
      vipStatus,
      settings,
    );
  }

  priceStringForClient(
    sellingPrice: number | null,
    enableDiscount: boolean,
    vipStatus: string | null | undefined,
    settings: VipDiscountSettings,
  ): string | null {
    return formatVipPrice(
      this.priceForClient(
        sellingPrice,
        enableDiscount,
        vipStatus,
        settings,
      ),
    );
  }

  appliedTier(
    enableDiscount: boolean,
    vipStatus: string | null | undefined,
  ): VipDiscountTier | null {
    if (!enableDiscount) return null;
    return vipDiscountTier(vipStatus);
  }

  tierPriceStrings(
    sellingPrice: number | null,
    enableDiscount: boolean,
    settings: VipDiscountSettings,
  ): { gold: string | null; diamond: string | null } {
    if (!enableDiscount || sellingPrice == null) {
      return { gold: null, diamond: null };
    }
    return {
      gold: formatVipPrice(
        computeVipPrice(
          sellingPrice,
          settings.gold.percent,
          settings.gold.capPhp,
        ),
      ),
      diamond: formatVipPrice(
        computeVipPrice(
          sellingPrice,
          settings.diamond.percent,
          settings.diamond.capPhp,
        ),
      ),
    };
  }
}
