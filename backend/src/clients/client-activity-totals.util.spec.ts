import { wholePesosFromMoney } from './client-activity-totals.util';

describe('wholePesosFromMoney', () => {
  it('returns 0 for empty values', () => {
    expect(wholePesosFromMoney(null)).toBe(0);
    expect(wholePesosFromMoney(undefined)).toBe(0);
    expect(wholePesosFromMoney('')).toBe(0);
    expect(wholePesosFromMoney('   ')).toBe(0);
  });

  it('returns 0 for non-positive or invalid amounts', () => {
    expect(wholePesosFromMoney(0)).toBe(0);
    expect(wholePesosFromMoney(-50)).toBe(0);
    expect(wholePesosFromMoney('abc')).toBe(0);
  });

  it('rounds money strings to whole pesos', () => {
    expect(wholePesosFromMoney('10000.00')).toBe(10000);
    expect(wholePesosFromMoney('10000.49')).toBe(10000);
    expect(wholePesosFromMoney('10000.50')).toBe(10001);
  });
});
