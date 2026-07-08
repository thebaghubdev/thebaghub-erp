import {
  computeAmountDueForInstallment,
  computeInstallmentViews,
} from './order-installment.util';
import { OrderInstallment } from './entities/order-installment.entity';

function installmentRow(
  installmentNumber: number,
  scheduledAmount: string,
  amountPaid: string | null = null,
): Pick<OrderInstallment, 'installmentNumber' | 'scheduledAmount' | 'amountPaid'> {
  return { installmentNumber, scheduledAmount, amountPaid };
}

describe('computeAmountDueForInstallment', () => {
  it('returns scheduled amount when there is no prior credit', () => {
    const rows = [
      installmentRow(1, '10000.00'),
      installmentRow(2, '10000.00'),
    ];
    expect(computeAmountDueForInstallment(rows, 1)).toBe(10000);
  });

  it('includes unpaid prior installments in amount due', () => {
    const rows = [
      installmentRow(1, '10000.00'),
      installmentRow(2, '10000.00'),
    ];
    expect(computeAmountDueForInstallment(rows, 2)).toBe(20000);
  });

  it('reduces amount due when prior installments were overpaid', () => {
    const rows = [
      installmentRow(1, '10000.00', '12000.00'),
      installmentRow(2, '10000.00', null),
    ];
    expect(computeAmountDueForInstallment(rows, 2)).toBe(8000);
  });

  it('matches computeInstallmentViews amountDue', () => {
    const rows = [
      installmentRow(1, '10000.00', '12000.00'),
      installmentRow(2, '10000.00', '5000.00'),
      installmentRow(3, '5000.00', null),
    ] as OrderInstallment[];
    const views = computeInstallmentViews(rows, '2026-01-01', () => null);
    for (const view of views) {
      expect(
        computeAmountDueForInstallment(rows, view.installmentNumber),
      ).toBe(Number.parseFloat(view.amountDue));
    }
  });
});
