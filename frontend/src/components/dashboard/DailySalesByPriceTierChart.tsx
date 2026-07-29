import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DAILY_SALES_TIER_SERIES,
  type DailySalesByTierRow,
} from "../../lib/dashboard-daily-sales";
import { formatPhpAmount } from "../../lib/format-php";

const Y_TICK_STEP = 200_000;

type TooltipPayloadItem = {
  name?: string;
  value?: number;
  color?: string;
};

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md dark:border-slate-600 dark:bg-slate-800">
      <p className="mb-1 font-semibold text-slate-900 dark:text-slate-100">
        Day {label}
      </p>
      <ul className="space-y-0.5">
        {payload.map((entry) => {
          const value = entry.value ?? 0;
          if (value <= 0) return null;
          return (
            <li
              key={entry.name}
              className="flex items-center justify-between gap-4 tabular-nums text-slate-700 dark:text-slate-200"
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: entry.color }}
                  aria-hidden
                />
                {entry.name}
              </span>
              <span>{formatPhpAmount(value)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type DailySalesByPriceTierChartProps = {
  data: DailySalesByTierRow[];
  yAxisMax: number;
};

export function DailySalesByPriceTierChart({
  data,
  yAxisMax,
}: DailySalesByPriceTierChartProps) {
  const yTicks = useMemo(() => {
    const max = Math.max(Y_TICK_STEP, yAxisMax);
    const count = Math.floor(max / Y_TICK_STEP) + 1;
    return Array.from({ length: count }, (_, i) => i * Y_TICK_STEP);
  }, [yAxisMax]);

  if (data.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-stone-600 dark:text-slate-400">
        No sold orders for this month.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={420}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 12, left: 4, bottom: 8 }}
        barCategoryGap="18%"
        barGap={2}
      >
        <CartesianGrid
          stroke="#d4cfc4"
          strokeDasharray="0"
          vertical={false}
        />
        <XAxis
          dataKey="day"
          tick={{ fill: "#57534e", fontSize: 11 }}
          axisLine={{ stroke: "#a8a29e" }}
          tickLine={{ stroke: "#a8a29e" }}
        />
        <YAxis
          domain={[0, yAxisMax]}
          ticks={yTicks}
          tickFormatter={(v) => formatPhpAmount(Number(v))}
          tick={{ fill: "#57534e", fontSize: 10 }}
          axisLine={{ stroke: "#a8a29e" }}
          tickLine={{ stroke: "#a8a29e" }}
          width={108}
        />
        <Tooltip
          content={<ChartTooltip />}
          cursor={{ fill: "rgba(120, 113, 108, 0.08)" }}
        />
        <Legend
          verticalAlign="bottom"
          align="center"
          iconType="square"
          iconSize={10}
          wrapperStyle={{ paddingTop: 16, fontSize: 12, color: "#44403c" }}
        />
        {DAILY_SALES_TIER_SERIES.map((series) => (
          <Bar
            key={series.dataKey}
            dataKey={series.dataKey}
            name={series.name}
            fill={series.fill}
            maxBarSize={28}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
