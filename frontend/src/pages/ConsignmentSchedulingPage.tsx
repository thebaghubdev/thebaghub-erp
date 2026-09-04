import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ConsignmentCalendar } from "../components/ConsignmentCalendar";
import { CreateScheduleWizard } from "../components/CreateScheduleWizard";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import { useFeatureAccess } from "../lib/use-feature-access";

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

type SchedulingTab = "schedules" | "create";

export function ConsignmentSchedulingPage() {
  const { token } = usePortalAuth();
  const { readOnly } = useFeatureAccess("consignment-scheduling");
  const [tab, setTab] = useState<SchedulingTab>("schedules");
  const [createWizardKey, setCreateWizardKey] = useState(0);
  const [rows, setRows] = useState<ConsignmentScheduleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createDirty, setCreateDirty] = useState(false);
  const [tabLeaveOpen, setTabLeaveOpen] = useState(false);

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
    if (tab === "schedules") void load();
  }, [tab, load]);

  const tabBtn =
    "-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500";

  return (
    <div className="w-full min-w-0">
      {readOnly ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          You have view-only access to this feature.
        </p>
      ) : null}
      <ConfirmDialog
        open={tabLeaveOpen}
        title="Unsaved changes"
        description="You have unsaved changes to this schedule. Switch tabs anyway?"
        cancelLabel="Stay"
        confirmLabel="Switch tab"
        onCancel={() => setTabLeaveOpen(false)}
        onConfirm={() => {
          setTab("schedules");
          setTabLeaveOpen(false);
        }}
      />
      <div
        className="mb-6 flex items-end gap-2 border-b border-slate-200 dark:border-slate-800"
        role="tablist"
        aria-label="Consignment scheduling sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "schedules"}
          id="tab-sched-schedules"
          aria-controls="panel-sched-schedules"
          className={`${tabBtn} ${
            tab === "schedules"
              ? "border-violet-600 text-violet-700 dark:text-violet-300"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
          onClick={() => {
            if (tab === "create" && createDirty) {
              setTabLeaveOpen(true);
              return;
            }
            setTab("schedules");
          }}
        >
          Consignment Schedules
        </button>
        {!readOnly ? (
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
              if (tab === "create") return;
              setTab("create");
              setCreateWizardKey((k) => k + 1);
            }}
          >
            Create a Schedule
          </button>
        ) : null}
      </div>

      {tab === "schedules" && (
        <section
          id="panel-sched-schedules"
          role="tabpanel"
          aria-labelledby="tab-sched-schedules"
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

      {tab === "create" && !readOnly && (
        <section
          key={createWizardKey}
          id="panel-sched-create"
          role="tabpanel"
          aria-labelledby="tab-sched-create"
          className="min-h-[12rem]"
        >
          <CreateScheduleWizard
            onDirtyChange={setCreateDirty}
            onScheduleSaved={() => {
              void load().then(() => setTab("schedules"));
            }}
          />
        </section>
      )}
    </div>
  );
}
