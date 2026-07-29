import { useCallback, useEffect, useState } from "react";
import { DailySalesByPriceTierChart } from "../components/dashboard/DailySalesByPriceTierChart";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import {
  currentYearMonthManila,
  formatDashboardMonthLabel,
  type DailySalesByPriceTierDashboard,
} from "../lib/dashboard-daily-sales";

export function DashboardsPage() {
  const { token } = usePortalAuth();
  const [{ year, month }, setYearMonth] = useState(currentYearMonthManila);
  const [dashboard, setDashboard] =
    useState<DailySalesByPriceTierDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/api/orders/dashboard/daily-sales-by-price-tier?year=${year}&month=${month}`,
        {},
        token,
      );
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `Request failed (${res.status})`);
      }
      const data = (await res.json()) as DailySalesByPriceTierDashboard;
      setDashboard(data);
    } catch (e) {
      setDashboard(null);
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [token, year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const monthInputValue = `${year}-${String(month).padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Dashboards
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Daily sales from orders marked item received, grouped by item price
            tier.
          </p>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">
            Month
          </span>
          <input
            type="month"
            value={monthInputValue}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              const [y, m] = v.split("-").map(Number);
              if (Number.isFinite(y) && Number.isFinite(m)) {
                setYearMonth({ year: y, month: m });
              }
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
      </div>

      <section
        aria-labelledby="daily-sales-chart-heading"
        className="overflow-hidden rounded-xl border border-slate-200 bg-[#f3ede4] shadow-sm dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="border-b border-stone-300/80 px-4 py-3 dark:border-slate-700">
          <h2
            id="daily-sales-chart-heading"
            className="text-sm font-semibold text-stone-800 dark:text-slate-100"
          >
            Daily sales by price tier — {formatDashboardMonthLabel(year, month)}
          </h2>
        </div>
        <div className="px-2 pb-4 pt-2 sm:px-4">
          {loading ? (
            <p className="py-16 text-center text-sm text-stone-600 dark:text-slate-400">
              Loading…
            </p>
          ) : error ? (
            <p className="py-16 text-center text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          ) : dashboard ? (
            <DailySalesByPriceTierChart
              data={dashboard.days}
              yAxisMax={dashboard.yAxisMax}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}
