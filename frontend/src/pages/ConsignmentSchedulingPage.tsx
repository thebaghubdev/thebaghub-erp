import { useCallback, useEffect, useState } from "react";
import { ConsignmentCalendar } from "../components/ConsignmentCalendar";
import { CreateScheduleWizard } from "../components/CreateScheduleWizard";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";

type ConsignmentScheduleRow = {
  id: string;
  deliveryDate: string;
  status: string;
  type: string;
  modeOfTransfer: string;
  branch: string;
  createdAt: string;
  createdByName: string;
  inquiryCount: number;
  rescheduleReason: string | null;
};

type SchedulingTab = "calendar" | "create";

export function ConsignmentSchedulingPage() {
  const { token } = usePortalAuth();
  const [tab, setTab] = useState<SchedulingTab>("calendar");
  const [createWizardKey, setCreateWizardKey] = useState(0);
  const [rows, setRows] = useState<ConsignmentScheduleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch("/api/consignment-schedules", {}, token);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as ConsignmentScheduleRow[];
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load schedules");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (tab === "calendar") void load();
  }, [tab, load]);

  const tabBtn =
    "-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500";

  return (
    <div className="w-full min-w-0">
      <div
        className="mb-6 flex items-end gap-2 border-b border-slate-200 dark:border-slate-800"
        role="tablist"
        aria-label="Consignment scheduling sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "calendar"}
          id="tab-sched-calendar"
          aria-controls="panel-sched-calendar"
          className={`${tabBtn} ${
            tab === "calendar"
              ? "border-violet-600 text-violet-700 dark:text-violet-300"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
          onClick={() => setTab("calendar")}
        >
          Consignment Calendar
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "create"}
          id="tab-sched-create"
          aria-controls="panel-sched-create"
          className={`${tabBtn} ${
            tab === "create"
              ? "border-violet-600 text-violet-700 dark:text-violet-300"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
          onClick={() => {
            setTab("create");
            setCreateWizardKey((k) => k + 1);
          }}
        >
          Create a Schedule
        </button>
      </div>

      {tab === "calendar" && (
        <section
          id="panel-sched-calendar"
          role="tabpanel"
          aria-labelledby="tab-sched-calendar"
          className="min-h-[12rem]"
        >
          {error && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          )}
          <ConsignmentCalendar schedules={rows} isLoading={loading} />
        </section>
      )}

      {tab === "create" && (
        <section
          key={createWizardKey}
          id="panel-sched-create"
          role="tabpanel"
          aria-labelledby="tab-sched-create"
          className="min-h-[12rem]"
        >
          <CreateScheduleWizard
            onScheduleSaved={() => {
              void load().then(() => setTab("calendar"));
            }}
          />
        </section>
      )}
    </div>
  );
}
