import { CONSIGNMENT_LIMIT_PER_DAY_KEY } from '../settings/consignment-setting-keys';
import { Setting } from '../settings/entities/setting.entity';
import { ConsignmentSchedule } from './entities/consignment-schedule.entities';

/** Aligns with frontend `utcDateKeyFromIso` / schedule `deliveryDate` storage. */
export function utcDateKeyFromDeliveryDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseConsignmentDailyLimit(
  raw: string | null | undefined,
): number | null {
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export async function loadConsignmentDailyLimit(
  settingsRepo: { findOne: (opts: object) => Promise<Setting | null> },
): Promise<number | null> {
  const row = await settingsRepo.findOne({
    where: { key: CONSIGNMENT_LIMIT_PER_DAY_KEY },
  });
  return parseConsignmentDailyLimit(row?.value);
}

export function countDeliveryInquiriesOnDay(
  schedules: ConsignmentSchedule[],
  dayKeyYmd: string,
  branch: string,
): number {
  const b = branch.trim().toLowerCase();
  const dayKey = dayKeyYmd.trim();
  return schedules.reduce((sum, s) => {
    if (s.type !== 'delivery') return sum;
    if (String(s.branch).trim().toLowerCase() !== b) return sum;
    if (utcDateKeyFromDeliveryDate(s.deliveryDate) !== dayKey) return sum;
    return sum + (s.items?.length ?? 0);
  }, 0);
}

export function fullDeliveryDatesForBranch(
  schedules: ConsignmentSchedule[],
  branch: string,
  dailyLimit: number | null,
  slotsNeeded = 1,
): string[] {
  if (dailyLimit == null) return [];
  const needed = Math.max(1, Math.floor(slotsNeeded));
  const b = branch.trim().toLowerCase();
  const counts = new Map<string, number>();
  for (const s of schedules) {
    if (s.type !== 'delivery') continue;
    if (String(s.branch).trim().toLowerCase() !== b) continue;
    const key = utcDateKeyFromDeliveryDate(s.deliveryDate);
    counts.set(key, (counts.get(key) ?? 0) + (s.items?.length ?? 0));
  }
  const full: string[] = [];
  for (const [day, count] of counts) {
    if (count + needed > dailyLimit) full.push(day);
  }
  return full.sort();
}
