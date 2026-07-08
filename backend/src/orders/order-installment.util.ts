import { OrderInstallment } from './entities/order-installment.entity';
import { Order } from './entities/order.entity';
import {
  ORDER_STATUS_FOR_PAYMENT,
  ORDER_INSTALLMENT_STATUS_UNPAID,
  PAYMENT_TYPE_LAYAWAY,
} from './order-status.constants';

export type OrderInstallmentView = {
  installmentNumber: number;
  installmentLabel: string;
  scheduledAmount: string;
  amountDue: string;
  amountPaid: string | null;
  status: string;
  proofUrl: string | null;
  dueDate: string | null;
};

const ORDINALS = [
  '1st',
  '2nd',
  '3rd',
  '4th',
  '5th',
  '6th',
  '7th',
  '8th',
  '9th',
  '10th',
  '11th',
  '12th',
];

export function installmentLabel(installmentNumber: number): string {
  if (installmentNumber >= 1 && installmentNumber <= ORDINALS.length) {
    return ORDINALS[installmentNumber - 1];
  }
  return `${installmentNumber}th`;
}

export function parseMoney(raw: string | null | undefined): number {
  if (raw == null || String(raw).trim() === '') return 0;
  const n = Number.parseFloat(String(raw));
  return Number.isFinite(n) ? n : 0;
}

export function formatMoney(value: number): string {
  return value.toFixed(2);
}

export function buildScheduledAmounts(
  layawayPrice: string,
  layawayMonthlyPayment: string,
  months: number,
): string[] {
  const total = parseMoney(layawayPrice);
  const monthly = parseMoney(layawayMonthlyPayment);
  const amounts: string[] = [];
  let sum = 0;
  for (let i = 1; i < months; i++) {
    amounts.push(formatMoney(monthly));
    sum += monthly;
  }
  amounts.push(formatMoney(total - sum));
  return amounts;
}

export function addMonthsToDateString(
  startDate: string,
  monthsToAdd: number,
): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(startDate);
  if (!m) return startDate;
  const date = new Date(Number(m[1]), Number(m[2]) - 1 + monthsToAdd, Number(m[3]));
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

export function shouldIncludeInstallmentSchedule(order: Order): boolean {
  return (
    order.paymentType === PAYMENT_TYPE_LAYAWAY &&
    order.status === ORDER_STATUS_FOR_PAYMENT &&
    order.layawayMonths != null &&
    order.layawayMonths > 0
  );
}

export function computeAmountDueForInstallment(
  rows: Pick<
    OrderInstallment,
    'installmentNumber' | 'scheduledAmount' | 'amountPaid'
  >[],
  targetInstallmentNumber: number,
): number {
  const sorted = [...rows].sort(
    (a, b) => a.installmentNumber - b.installmentNumber,
  );

  let credit = 0;
  for (const row of sorted) {
    const scheduled = parseMoney(row.scheduledAmount);
    const amountDue = Math.max(0, scheduled - credit);
    credit = Math.max(0, credit - scheduled);
    const paid = row.amountPaid != null ? parseMoney(row.amountPaid) : 0;
    credit += paid - amountDue;

    if (row.installmentNumber === targetInstallmentNumber) {
      return amountDue;
    }
  }

  throw new Error(`Installment ${targetInstallmentNumber} not found`);
}

export function computeRemainingBalance(
  layawayPrice: string | null | undefined,
  rows: Pick<OrderInstallment, 'amountPaid'>[],
): number {
  const price = parseMoney(layawayPrice ?? '');
  const paid = rows.reduce(
    (sum, row) => sum + parseMoney(row.amountPaid),
    0,
  );
  return Math.max(0, Math.round((price - paid) * 100) / 100);
}

export function computeInstallmentViews(
  rows: OrderInstallment[],
  paymentStartDate: string | null,
  getProofUrl: (row: OrderInstallment) => string | null,
): OrderInstallmentView[] {
  const sorted = [...rows].sort(
    (a, b) => a.installmentNumber - b.installmentNumber,
  );

  let credit = 0;
  return sorted.map((row) => {
    const scheduled = parseMoney(row.scheduledAmount);
    const amountDue = Math.max(0, scheduled - credit);
    credit = Math.max(0, credit - scheduled);
    const paid = row.amountPaid != null ? parseMoney(row.amountPaid) : 0;
    credit += paid - amountDue;

    const dueDate =
      paymentStartDate != null
        ? addMonthsToDateString(
            paymentStartDate,
            row.installmentNumber - 1,
          )
        : null;

    return {
      installmentNumber: row.installmentNumber,
      installmentLabel: installmentLabel(row.installmentNumber),
      scheduledAmount: row.scheduledAmount,
      amountDue: formatMoney(amountDue),
      amountPaid: row.amountPaid,
      status: row.status?.trim() || ORDER_INSTALLMENT_STATUS_UNPAID,
      proofUrl: getProofUrl(row),
      dueDate,
    };
  });
}
