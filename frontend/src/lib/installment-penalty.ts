import { parsePhpStringToNumber } from "./format-php";

const PENALTY_RATE = 0.05;
const PENALTY_WEEK_DAYS = 7;

function utcDateFromYmd(ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) throw new Error(`Invalid date: ${ymd}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function daysBetweenYmd(startYmd: string, endYmd: string): number {
  const start = utcDateFromYmd(startYmd.slice(0, 10));
  const end = utcDateFromYmd(endYmd.slice(0, 10));
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function completeWeeksLate(
  dueDate: string | null,
  asOfDate: string,
): number {
  if (dueDate == null || dueDate.trim() === "") return 0;
  const daysLate = daysBetweenYmd(dueDate.slice(0, 10), asOfDate.slice(0, 10));
  if (daysLate <= 0) return 0;
  return Math.floor(daysLate / PENALTY_WEEK_DAYS);
}

function computeRemainingUnpaid(
  amountDue: number,
  amountPaid: string | null,
): number {
  const paid = parsePhpStringToNumber(amountPaid ?? "") ?? 0;
  return Math.max(0, Math.round((amountDue - paid) * 100) / 100);
}

/** 5% of remaining unpaid per complete week late (floor). */
function computeAutoPenalty(
  amountDue: number,
  amountPaid: string | null,
  dueDate: string | null,
  asOfDate: string,
): number {
  const remainingUnpaid = computeRemainingUnpaid(amountDue, amountPaid);
  if (remainingUnpaid <= 0) return 0;
  const weeksLate = completeWeeksLate(dueDate, asOfDate);
  if (weeksLate <= 0) return 0;
  return (
    Math.round(remainingUnpaid * PENALTY_RATE * weeksLate * 100) / 100
  );
}

function resolvePenaltyAmount(
  amountDue: number,
  amountPaid: string | null,
  dueDate: string | null,
  asOfDate: string,
  storedPenalty: string | null,
  penaltyOverridden: boolean,
  penaltyWaiveStatus?: string | null,
): number {
  const waiveStatus = (penaltyWaiveStatus ?? "").trim().toLowerCase();
  if (penaltyOverridden || waiveStatus === "pending" || waiveStatus === "approved") {
    return parsePhpStringToNumber(storedPenalty ?? "") ?? 0;
  }
  return computeAutoPenalty(amountDue, amountPaid, dueDate, asOfDate);
}

export {
  computeAutoPenalty,
  resolvePenaltyAmount,
};
