import {
  applyPaymentCreditToInstallments,
  computeAmountDueForInstallment,
  computeAutoPenalty,
  computeInstallmentViews,
  computeRemainingUnpaidForInstallment,
  completeWeeksLate,
  daysBetweenYmd,
} from './order-installment.util';
import { OrderInstallment } from './entities/order-installment.entity';
import { ORDER_INSTALLMENT_STATUS_PAID, ORDER_INSTALLMENT_STATUS_UNPAID } from './order-status.constants';

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

  it('prefers stored dueDate over computed schedule', () => {
    const rows = [
      {
        ...installmentRow(1, '10000.00'),
        dueDate: '2026-03-15',
      },
      {
        ...installmentRow(2, '10000.00'),
        dueDate: null,
      },
    ] as OrderInstallment[];
    const views = computeInstallmentViews(rows, '2026-01-01', () => null);
    expect(views[0].dueDate).toBe('2026-03-15');
    expect(views[1].dueDate).toBe('2026-02-01');
  });
});

describe('installment penalty', () => {
  it('counts only complete 7-day periods after due date', () => {
    expect(completeWeeksLate('2026-01-01', '2026-01-01')).toBe(0);
    expect(completeWeeksLate('2026-01-01', '2026-01-07')).toBe(0);
    expect(completeWeeksLate('2026-01-01', '2026-01-08')).toBe(1);
    expect(completeWeeksLate('2026-01-01', '2026-01-14')).toBe(1);
    expect(completeWeeksLate('2026-01-01', '2026-01-15')).toBe(2);
  });

  it('returns zero days when paid before due date', () => {
    expect(daysBetweenYmd('2026-01-10', '2026-01-05')).toBe(-5);
    expect(completeWeeksLate('2026-01-10', '2026-01-05')).toBe(0);
  });

  it('computes 5% of remaining unpaid per complete week', () => {
    expect(
      computeAutoPenalty(10000, null, '2026-01-01', '2026-01-08'),
    ).toBe(500);
    expect(
      computeAutoPenalty(10000, '4000.00', '2026-01-01', '2026-01-15'),
    ).toBe(600);
    expect(
      computeAutoPenalty(10000, '10000.00', '2026-01-01', '2026-02-01'),
    ).toBe(0);
    expect(
      computeAutoPenalty(10000, null, '2026-01-01', '2026-01-07'),
    ).toBe(0);
  });

  it('computes remaining unpaid from amount due minus amount paid', () => {
    expect(computeRemainingUnpaidForInstallment(10000, '2500')).toBe(7500);
    expect(computeRemainingUnpaidForInstallment(8000, '9000')).toBe(0);
  });

  it('auto-computes penalty in installment views for overdue unpaid rows', () => {
    const rows = [
      {
        ...installmentRow(1, '10000.00'),
        dueDate: '2026-01-01',
        penalty: null,
        penaltyOverridden: false,
        status: 'Unpaid',
      },
    ] as OrderInstallment[];
    const views = computeInstallmentViews(
      rows,
      '2026-01-01',
      () => null,
      '2026-01-15',
    );
    expect(views[0].penalty).toBe('1000.00');
    expect(views[0].penaltyOverridden).toBe(false);
  });
});

describe('applyPaymentCreditToInstallments', () => {
  it('marks fully covered installments as paid and applies partial credit', () => {
    const rows = [
      {
        installmentNumber: 1,
        scheduledAmount: '10000.00',
        amountPaid: null,
        status: ORDER_INSTALLMENT_STATUS_UNPAID,
      },
      {
        installmentNumber: 2,
        scheduledAmount: '10000.00',
        amountPaid: null,
        status: ORDER_INSTALLMENT_STATUS_UNPAID,
      },
      {
        installmentNumber: 3,
        scheduledAmount: '5000.00',
        amountPaid: null,
        status: ORDER_INSTALLMENT_STATUS_UNPAID,
      },
    ] as OrderInstallment[];

    const markedPaidAt = new Date('2026-01-15T12:00:00Z');
    const result = applyPaymentCreditToInstallments(
      rows,
      15000,
      '2026-01-10',
      markedPaidAt,
    );

    expect(result.fullyPaidInstallmentNumbers).toEqual([1]);
    expect(rows[0].status).toBe(ORDER_INSTALLMENT_STATUS_PAID);
    expect(rows[0].amountPaid).toBe('10000.00');
    expect(rows[1].status).toBe(ORDER_INSTALLMENT_STATUS_UNPAID);
    expect(rows[1].amountPaid).toBe('5000.00');
    expect(rows[2].amountPaid).toBeNull();
  });
});
