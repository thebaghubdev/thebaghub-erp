export type DailySalesByTierRow = {
  day: string;
  below40k: number;
  tier40k799k: number;
  tier80k199k: number;
  tier200kPlus: number;
};

export type DailySalesByPriceTierDashboard = {
  year: number;
  month: number;
  days: DailySalesByTierRow[];
  yAxisMax: number;
};

export const DAILY_SALES_TIER_SERIES = [
  { dataKey: "below40k" as const, name: "Below 40k", fill: "#2563eb" },
  { dataKey: "tier40k799k" as const, name: "40k-79.9k", fill: "#f97316" },
  { dataKey: "tier80k199k" as const, name: "80k-199k", fill: "#94a3b8" },
  { dataKey: "tier200kPlus" as const, name: "200k", fill: "#eab308" },
] as const;

const MANILA_TZ = "Asia/Manila";

/** Current calendar year and month (1–12) in Asia/Manila. */
export function currentYearMonthManila(): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return { year, month };
}

export function formatDashboardMonthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: MANILA_TZ,
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 15)));
}
