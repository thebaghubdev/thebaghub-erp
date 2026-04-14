import { createColumnHelper } from "@tanstack/react-table";
import { useCallback, useEffect, useState } from "react";
import { ConsignmentCalendar } from "../components/ConsignmentCalendar";
import { CreateScheduleWizard } from "../components/CreateScheduleWizard";
import { DataTable } from "../components/data-table/DataTable";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import {
  branchLabel,
  modeOfTransferLabel,
  scheduleTypeLabel,
} from "../lib/consignment-schedule-labels";
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
};

type SchedulingTab = "all" | "create" | "calendar";

const columnHelper = createColumnHelper<ConsignmentScheduleRow>();

const columns = [
  columnHelper.accessor("deliveryDate", {
    id: "deliveryDate",
    header: "Delivery date",
    sortingFn: "alphanumeric",
    cell: ({ row }) => (
      <span className="text-slate-600 dark:text-slate-400">
        <SubmittedAtCell iso={row.original.deliveryDate} />
      </span>
    ),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: ({ getValue }) => (
      <span className="capitalize text-slate-700 dark:text-slate-300">
        {getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("type", {
    header: "Type",
    cell: ({ getValue }) => (
      <span className="text-slate-800 dark:text-slate-200">
        {scheduleTypeLabel(getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("modeOfTransfer", {
    header: "Mode",
    cell: ({ row }) => (
      <span className="text-slate-800 dark:text-slate-200">
        {modeOfTransferLabel(row.original.type, row.original.modeOfTransfer)}
      </span>
    ),
  }),
  columnHelper.accessor("branch", {
    header: "Branch",
    cell: ({ getValue }) => (
      <span className="text-slate-800 dark:text-slate-200">
        {branchLabel(getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("createdAt", {
    id: "created",
    header: "Created",
    sortingFn: "alphanumeric",
    cell: ({ row }) => (
      <span className="text-slate-600 dark:text-slate-400">
        <SubmittedAtCell iso={row.original.createdAt} />
      </span>
    ),
  }),
  columnHelper.accessor("createdByName", {
    header: "Created by",
    cell: ({ getValue }) => (
      <span className="font-medium text-slate-900 dark:text-slate-100">
        {getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("inquiryCount", {
    header: () => <span title="Inquiries in this schedule">Inquiries</span>,
    cell: ({ getValue }) => (
      <span className="tabular-nums text-slate-800 dark:text-slate-200">
        {getValue()}
      </span>
    ),
  }),
];

export function ConsignmentSchedulingPage() {
  const { token } = usePortalAuth();
  const [tab, setTab] = useState<SchedulingTab>("all");
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
    if (tab === "all" || tab === "calendar") void load();
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
          aria-selected={tab === "all"}
          id="tab-sched-all"
          aria-controls="panel-sched-all"
          className={`${tabBtn} ${
            tab === "all"
              ? "border-violet-600 text-violet-700 dark:text-violet-300"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
          onClick={() => setTab("all")}
        >
          All Schedules
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
      </div>

      {tab === "all" && (
        <section
          id="panel-sched-all"
          role="tabpanel"
          aria-labelledby="tab-sched-all"
        >
          {error && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          )}

          <DataTable<ConsignmentScheduleRow>
            data={rows}
            columns={columns}
            isLoading={loading}
            emptyMessage="No consignment schedules yet."
            hideEmptyState={!!error}
            getRowId={(row) => row.id}
            getRowAriaLabel={(row) =>
              `Consignment schedule ${row.type}, ${row.deliveryDate}`
            }
            tableClassName="w-full min-w-[720px] table-fixed border-collapse text-left"
          />
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
    </div>
  );
}
