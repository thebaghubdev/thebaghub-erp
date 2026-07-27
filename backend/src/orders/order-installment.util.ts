import { OrderInstallment } from './entities/order-installment.entity';
import { Order } from './entities/order.entity';
import {
  INSTALLMENT_PENALTY_RATE,
  INSTALLMENT_PENALTY_WEEK_DAYS,
} from './installment-penalty.constants';
import {
  ORDER_STATUS_FOR_PAYMENT,
  ORDER_STATUS_FOR_PICKUP,
  ORDER_STATUS_ITEM_RECEIVED,
  ORDER_STATUS_ITEM_RECEIVED_PAID,
  ORDER_STATUS_ITEM_RECEIVED_UNPAID,
  ORDER_STATUS_PAID,
  ORDER_INSTALLMENT_STATUS_PAID,
  ORDER_INSTALLMENT_STATUS_UNPAID,
  PAYMENT_TYPE_LAYAWAY,
} from './order-status.constants';
import { isCreditLinePaymentType } from './order-payment-type.util';

export type OrderInstallmentView = {
  installmentNumber: number;
  installmentLabel: string;
  scheduledAmount: string;
  amountDue: string;
  amountPaid: string | null;
  penalty: string | null;
  penaltyOverridden: boolean;
  status: string;
  proofUrl: string | null;
  dueDate: string | null;
  paymentDate: string | null;
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

export function todayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isInstallmentPaidStatus(status: string | null | undefined): boolean {
  return status?.trim().toLowerCase() === ORDER_INSTALLMENT_STATUS_PAID.toLowerCase();
}

function utcDateFromYmd(ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) {
    throw new Error(`Invalid date: ${ymd}`);
  }
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function daysBetweenYmd(startYmd: string, endYmd: string): number {
  const start = utcDateFromYmd(startYmd.slice(0, 10));
  const end = utcDateFromYmd(endYmd.slice(0, 10));
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

/** Complete 7-day periods after due date (floor). Same-day payment = 0 weeks. */
export function completeWeeksLate(
  dueDate: string | null,
  asOfDate: string,
): number {
  if (dueDate == null || dueDate.trim() === '') {
    return 0;
  }
  const daysLate = daysBetweenYmd(dueDate.slice(0, 10), asOfDate.slice(0, 10));
  if (daysLate <= 0) {
    return 0;
  }
  return Math.floor(daysLate / INSTALLMENT_PENALTY_WEEK_DAYS);
}

export function computeRemainingUnpaidForInstallment(
  amountDue: number,
  amountPaid: string | null | undefined,
): number {
  const paid = parseMoney(amountPaid);
  return Math.max(0, Math.round((amountDue - paid) * 100) / 100);
}

export function computeAutoPenalty(
  amountDue: number,
  amountPaid: string | null | undefined,
  dueDate: string | null,
  asOfDate: string,
): number {
  const remainingUnpaid = computeRemainingUnpaidForInstallment(
    amountDue,
    amountPaid,
  );
  if (remainingUnpaid <= 0) {
    return 0;
  }
  const weeksLate = completeWeeksLate(dueDate, asOfDate);
  if (weeksLate <= 0) {
    return 0;
  }
  return (
    Math.round(
      remainingUnpaid * INSTALLMENT_PENALTY_RATE * weeksLate * 100,
    ) / 100
  );
}

export function effectiveDueDateForInstallment(
  row: Pick<OrderInstallment, 'dueDate' | 'installmentNumber'>,
  paymentStartDate: string | null,
): string | null {
  if (row.dueDate != null && String(row.dueDate).trim() !== '') {
    return String(row.dueDate).slice(0, 10);
  }
  return computeDefaultDueDate(paymentStartDate, row.installmentNumber);
}

export function resolveInstallmentPenalty(
  row: Pick<
    OrderInstallment,
    | 'amountPaid'
    | 'dueDate'
    | 'installmentNumber'
    | 'penalty'
    | 'penaltyOverridden'
    | 'paymentDate'
    | 'status'
  >,
  amountDue: number,
  paymentStartDate: string | null,
  asOfDate: string,
): string | null {
  if (isInstallmentPaidStatus(row.status)) {
    return row.penalty != null && String(row.penalty).trim() !== ''
      ? formatMoney(parseMoney(row.penalty))
      : null;
  }

  if (row.penaltyOverridden) {
    return row.penalty != null && String(row.penalty).trim() !== ''
      ? formatMoney(parseMoney(row.penalty))
      : null;
  }

  const dueDate = effectiveDueDateForInstallment(row, paymentStartDate);
  const autoPenalty = computeAutoPenalty(
    amountDue,
    row.amountPaid,
    dueDate,
    asOfDate,
  );
  return autoPenalty > 0 ? formatMoney(autoPenalty) : null;
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

export function computeDefaultDueDate(
  paymentStartDate: string | null,
  installmentNumber: number,
): string | null {
  if (paymentStartDate == null || installmentNumber < 1) {
    return null;
  }
  return addMonthsToDateString(paymentStartDate, installmentNumber - 1);
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
  if (order.layawayMonths == null || order.layawayMonths <= 0) {
    return false;
  }
  if (order.paymentType === PAYMENT_TYPE_LAYAWAY) {
    return (
      order.status === ORDER_STATUS_FOR_PAYMENT ||
      order.status === ORDER_STATUS_PAID ||
      order.status === ORDER_STATUS_FOR_PICKUP ||
      order.status === ORDER_STATUS_ITEM_RECEIVED
    );
  }
  if (isCreditLinePaymentType(order.paymentType)) {
    return (
      order.status === ORDER_STATUS_FOR_PICKUP ||
      order.status === ORDER_STATUS_ITEM_RECEIVED_UNPAID ||
      order.status === ORDER_STATUS_ITEM_RECEIVED_PAID
    );
  }
  return false;
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
  rows: Pick<OrderInstallment, 'amountPaid' | 'penalty' | 'status'>[],
): number {
  const price = parseMoney(layawayPrice ?? '');
  const paid = rows.reduce(
    (sum, row) => sum + parseMoney(row.amountPaid),
    0,
  );
  const unpaidPenalties = rows.reduce((sum, row) => {
    if (isInstallmentPaidStatus(row.status)) {
      return sum;
    }
    return sum + parseMoney(row.penalty);
  }, 0);
  return Math.max(
    0,
    Math.round((price - paid + unpaidPenalties) * 100) / 100,
  );
}

export function computeInstallmentViews(
  rows: OrderInstallment[],
  paymentStartDate: string | null,
  getProofUrl: (row: OrderInstallment) => string | null,
  asOfDate: string = todayDateString(),
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

    const dueDate = effectiveDueDateForInstallment(row, paymentStartDate);
    const penaltyAsOfDate = isInstallmentPaidStatus(row.status)
      ? row.paymentDate != null && String(row.paymentDate).trim() !== ''
        ? String(row.paymentDate).slice(0, 10)
        : asOfDate
      : asOfDate;
    const penalty = resolveInstallmentPenalty(
      row,
      amountDue,
      paymentStartDate,
      penaltyAsOfDate,
    );

    return {
      installmentNumber: row.installmentNumber,
      installmentLabel: installmentLabel(row.installmentNumber),
      scheduledAmount: row.scheduledAmount,
      amountDue: formatMoney(amountDue),
      amountPaid: row.amountPaid,
      penalty,
      penaltyOverridden: row.penaltyOverridden ?? false,
      status: row.status?.trim() || ORDER_INSTALLMENT_STATUS_UNPAID,
      proofUrl: getProofUrl(row),
      dueDate,
      paymentDate:
        row.paymentDate != null && String(row.paymentDate).trim() !== ''
          ? String(row.paymentDate).slice(0, 10)
          : null,
    };
  });
}
