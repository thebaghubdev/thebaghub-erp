import { APP_CALENDAR_TIME_ZONE } from '../orders/order-status.constants';
import { calendarDateStringInTimeZone } from '../inventory/sold-warranty.util';

const MS_PER_DAY = 86_400_000;

function parseDateOnly(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split('-').map((part) => Number(part));
  return { year, month, day };
}

function formatDateOnly(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addCalendarDaysToDateOnly(dateStr: string, days: number): string {
  const { year, month, day } = parseDateOnly(dateStr);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return formatDateOnly(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

function weekdayUtc(dateStr: string): number {
  const { year, month, day } = parseDateOnly(dateStr);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function compareDateOnly(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function listTuesdaysInMonth(year: number, month: number): string[] {
  const totalDays = daysInMonth(year, month);
  const tuesdays: string[] = [];
  for (let day = 1; day <= totalDays; day += 1) {
    const dateStr = formatDateOnly(year, month, day);
    if (weekdayUtc(dateStr) === 2) {
      tuesdays.push(dateStr);
    }
  }
  return tuesdays;
}

function firstThursdayOfMonth(year: number, month: number): string {
  const totalDays = daysInMonth(year, month);
  for (let day = 1; day <= totalDays; day += 1) {
    const dateStr = formatDateOnly(year, month, day);
    if (weekdayUtc(dateStr) === 4) {
      return dateStr;
    }
  }
  throw new Error(`No Thursday found in ${year}-${month}`);
}

/** Wednesday in calendar week 2 (days 8–14). */
function wednesdayOfCalendarWeekTwo(year: number, month: number): string {
  const lastDay = Math.min(14, daysInMonth(year, month));
  for (let day = 8; day <= lastDay; day += 1) {
    const dateStr = formatDateOnly(year, month, day);
    if (weekdayUtc(dateStr) === 3) {
      return dateStr;
    }
  }
  throw new Error(`No Wednesday found in week 2 of ${year}-${month}`);
}

function firstThursdayOnOrAfter(dateStr: string): string {
  let current = dateStr;
  for (let i = 0; i < 7; i += 1) {
    if (weekdayUtc(current) === 4) {
      return current;
    }
    current = addCalendarDaysToDateOnly(current, 1);
  }
  throw new Error(`No Thursday found on or after ${dateStr}`);
}

function postEligibilityWindowIndex(
  soldDateOnly: string,
  firstPostWindowThursday: string,
): number {
  let windowIndex = 0;
  while (true) {
    const windowStart = addCalendarDaysToDateOnly(
      firstPostWindowThursday,
      windowIndex * 7,
    );
    const windowEnd = addCalendarDaysToDateOnly(windowStart, 6);
    if (compareDateOnly(soldDateOnly, windowEnd) <= 0) {
      return windowIndex;
    }
    windowIndex += 1;
    if (windowIndex > 6) {
      throw new Error(
        `Could not resolve audit window for sold date ${soldDateOnly}`,
      );
    }
  }
}

function nextMonthFirstTuesday(afterDateOnly: string): string {
  const { year, month } = parseDateOnly(afterDateOnly);
  const nextMonth =
    month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const tuesdays = listTuesdaysInMonth(nextMonth.year, nextMonth.month);
  if (tuesdays.length === 0) {
    throw new Error(
      `No Tuesday found in ${nextMonth.year}-${nextMonth.month}`,
    );
  }
  return tuesdays[0];
}

/**
 * Consignor payment audit date from the item sold date (Item Received /
 * sold under warranty). Always a Tuesday in Asia/Manila calendar terms.
 */
export function computeConsignorPaymentAuditDate(
  soldAt: Date,
  timeZone = APP_CALENDAR_TIME_ZONE,
): string {
  const soldDateOnly = calendarDateStringInTimeZone(soldAt, timeZone);
  const { year, month } = parseDateOnly(soldDateOnly);
  const tuesdays = listTuesdaysInMonth(year, month);
  if (tuesdays.length === 0) {
    throw new Error(`No Tuesday found in ${year}-${month}`);
  }

  const firstThursday = firstThursdayOfMonth(year, month);
  if (compareDateOnly(soldDateOnly, firstThursday) < 0) {
    return tuesdays[0];
  }

  const originalWindowEnd = wednesdayOfCalendarWeekTwo(year, month);
  if (compareDateOnly(soldDateOnly, originalWindowEnd) <= 0) {
    // Thu week 1 through Wed week 2 → 3rd-week Tuesday (index 1 in July 2026).
    const targetIndex = 1;
    if (targetIndex >= tuesdays.length) {
      return nextMonthFirstTuesday(soldDateOnly);
    }
    return tuesdays[targetIndex];
  }

  const firstPostWindowThursday = firstThursdayOnOrAfter(
    addCalendarDaysToDateOnly(originalWindowEnd, 1),
  );
  const windowIndex = postEligibilityWindowIndex(
    soldDateOnly,
    firstPostWindowThursday,
  );
  const windowStart = addCalendarDaysToDateOnly(
    firstPostWindowThursday,
    windowIndex * 7,
  );
  const dayInWindow = Math.round(
    (Date.parse(`${soldDateOnly}T00:00:00Z`) -
      Date.parse(`${windowStart}T00:00:00Z`)) /
      MS_PER_DAY,
  );
  const insideWindow = dayInWindow < 4;
  const targetIndex = insideWindow ? windowIndex + 2 : windowIndex + 3;

  if (targetIndex >= tuesdays.length) {
    return nextMonthFirstTuesday(soldDateOnly);
  }

  return tuesdays[targetIndex];
}
