import {
  computeVipDiscountAmount,
  computeVipPrice,
  vipPriceForStatus,
  DEFAULT_VIP_DISCOUNT_SETTINGS,
} from './vip-discount.util';

describe('computeVipDiscountAmount', () => {
  it('uses percent off when below the cap', () => {
    expect(computeVipDiscountAmount(50_000, 3, 3_000)).toBe(1_500);
    expect(computeVipDiscountAmount(50_000, 5, 5_000)).toBe(2_500);
  });

  it('caps the discount in PHP', () => {
    expect(computeVipDiscountAmount(200_000, 3, 3_000)).toBe(3_000);
    expect(computeVipDiscountAmount(200_000, 5, 5_000)).toBe(5_000);
  });
});

describe('computeVipPrice', () => {
  it('subtracts the effective discount from the selling price', () => {
    expect(computeVipPrice(50_000, 3, 3_000)).toBe(48_500);
    expect(computeVipPrice(200_000, 3, 3_000)).toBe(197_000);
  });
});

describe('vipPriceForStatus', () => {
  const settings = DEFAULT_VIP_DISCOUNT_SETTINGS;

  it('returns null unless the item allows VIP discount and the client is VIP', () => {
    expect(vipPriceForStatus(50_000, false, 'Gold', settings)).toBeNull();
    expect(vipPriceForStatus(50_000, true, 'Regular', settings)).toBeNull();
    expect(vipPriceForStatus(50_000, true, null, settings)).toBeNull();
  });

  it('uses Gold or Diamond settings based on the client tier', () => {
    expect(vipPriceForStatus(50_000, true, 'Gold', settings)).toBe(48_500);
    expect(vipPriceForStatus(50_000, true, 'Diamond', settings)).toBe(47_500);
  });
});
