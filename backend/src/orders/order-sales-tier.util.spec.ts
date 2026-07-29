import {
  salesPriceTierKey,
  suggestDailySalesYAxisMax,
} from './order-sales-tier.util';

describe('salesPriceTierKey', () => {
  it('maps price bands', () => {
    expect(salesPriceTierKey(39_999)).toBe('below40k');
    expect(salesPriceTierKey(40_000)).toBe('tier40k799k');
    expect(salesPriceTierKey(79_999)).toBe('tier40k799k');
    expect(salesPriceTierKey(80_000)).toBe('tier80k199k');
    expect(salesPriceTierKey(199_999)).toBe('tier80k199k');
    expect(salesPriceTierKey(200_000)).toBe('tier200kPlus');
  });
});

describe('suggestDailySalesYAxisMax', () => {
  it('rounds up to 200k steps', () => {
    expect(suggestDailySalesYAxisMax(0)).toBe(200_000);
    expect(suggestDailySalesYAxisMax(50_000)).toBe(200_000);
    expect(suggestDailySalesYAxisMax(1_050_000)).toBe(1_200_000);
  });
});
