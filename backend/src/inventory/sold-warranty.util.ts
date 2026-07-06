import {
  APP_CALENDAR_TIME_ZONE,
  SOLD_UNDER_WARRANTY_CALENDAR_DAYS,
} from '../orders/order-status.constants';

export function calendarDateStringInTimeZone(
  date: Date,
  timeZone = APP_CALENDAR_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function addCalendarDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map((part) => Number(part));
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isSoldDateEligibleForFinalStatus(
  dateSold: Date,
  referenceDate: Date,
  warrantyCalendarDays = SOLD_UNDER_WARRANTY_CALENDAR_DAYS,
  timeZone = APP_CALENDAR_TIME_ZONE,
): boolean {
  const soldDateOnly = calendarDateStringInTimeZone(dateSold, timeZone);
  const referenceDateOnly = calendarDateStringInTimeZone(
    referenceDate,
    timeZone,
  );
  const warrantyEndDate = addCalendarDays(soldDateOnly, warrantyCalendarDays);
  return referenceDateOnly >= warrantyEndDate;
}
