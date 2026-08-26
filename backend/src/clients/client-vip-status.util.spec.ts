import {
  deriveClientVipStatus,
  normalizeClientVipStatus,
} from './client-vip-status.util';

describe('deriveClientVipStatus', () => {
  it('maps combined totals onto Regular, Gold, and Diamond', () => {
    expect(deriveClientVipStatus(0, 300_000, 600_000)).toBe('Regular');
    expect(deriveClientVipStatus(299_999, 300_000, 600_000)).toBe('Regular');
    expect(deriveClientVipStatus(300_000, 300_000, 600_000)).toBe('Gold');
    expect(deriveClientVipStatus(599_999, 300_000, 600_000)).toBe('Gold');
    expect(deriveClientVipStatus(600_000, 300_000, 600_000)).toBe('Diamond');
  });
});

describe('normalizeClientVipStatus', () => {
  it('normalizes known labels and defaults to Regular', () => {
    expect(normalizeClientVipStatus('Gold')).toBe('Gold');
    expect(normalizeClientVipStatus('diamond')).toBe('Diamond');
    expect(normalizeClientVipStatus(null)).toBe('Regular');
  });
});
