import { computeConsignorPaymentAuditDate } from './consignor-payment-audit-date.util';

function soldUnderWarrantyAtManila(
  year: number,
  month: number,
  day: number,
  hour = 12,
): Date {
  // Noon UTC+8 ≈ 04:00 UTC — stable calendar day in Asia/Manila.
  return new Date(Date.UTC(year, month - 1, day, hour - 8, 0, 0));
}

describe('computeConsignorPaymentAuditDate', () => {
  it('maps Jul 1 sold under warranty to Jul 7 audit Tuesday', () => {
    expect(
      computeConsignorPaymentAuditDate(soldUnderWarrantyAtManila(2026, 7, 1)),
    ).toBe('2026-07-07');
  });

  it('maps Jul 2–8 sold under warranty to Jul 14 audit Tuesday', () => {
    for (const day of [2, 3, 4, 5, 6, 7, 8]) {
      expect(
        computeConsignorPaymentAuditDate(
          soldUnderWarrantyAtManila(2026, 7, day),
        ),
      ).toBe('2026-07-14');
    }
  });

  it('maps Jul 9–12 sold under warranty to Jul 21 audit Tuesday', () => {
    for (const day of [9, 10, 11, 12]) {
      expect(
        computeConsignorPaymentAuditDate(
          soldUnderWarrantyAtManila(2026, 7, day),
        ),
      ).toBe('2026-07-21');
    }
  });

  it('maps Jul 13–15 sold under warranty to Jul 28 audit Tuesday', () => {
    for (const day of [13, 14, 15]) {
      expect(
        computeConsignorPaymentAuditDate(
          soldUnderWarrantyAtManila(2026, 7, day),
        ),
      ).toBe('2026-07-28');
    }
  });

  it('maps Jul 29 sold under warranty to Aug 4 audit Tuesday', () => {
    expect(
      computeConsignorPaymentAuditDate(soldUnderWarrantyAtManila(2026, 7, 29)),
    ).toBe('2026-08-04');
  });
});
