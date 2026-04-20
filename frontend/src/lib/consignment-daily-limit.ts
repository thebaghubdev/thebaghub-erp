/** Aligns with backend `deliveryDate` stored as `YYYY-MM-DDT12:00:00.000Z`. */
export function utcDateKeyFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDailyLimit(raw: string | undefined): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export type ScheduleListRowForLimit = {
  id: string;
  deliveryDate: string;
  type: string;
  branch: string;
  inquiryCount: number;
};

/** Sum of inquiry counts on a calendar day for branch + schedule type; optionally exclude one schedule (e.g. when moving it). */
export function countScheduledInquiriesOnDay(params: {
  rows: ScheduleListRowForLimit[];
  dayKeyYmd: string;
  branch: string;
  scheduleType: string;
  excludeScheduleId?: string;
}): number {
  const { rows, dayKeyYmd, branch, scheduleType, excludeScheduleId } = params;
  const b = branch.trim().toLowerCase();
  const dayKey = dayKeyYmd.trim();
  return rows.reduce((sum, row) => {
    if (excludeScheduleId != null && row.id === excludeScheduleId) return sum;
    if (row.type !== scheduleType) return sum;
    if (String(row.branch).trim().toLowerCase() !== b) return sum;
    if (utcDateKeyFromIso(row.deliveryDate) !== dayKey) return sum;
    return sum + (Number(row.inquiryCount) || 0);
  }, 0);
}
