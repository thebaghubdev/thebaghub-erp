import { createColumnHelper } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "../components/data-table/DataTable";
import { StaffWalkInConsignmentWizard } from "../components/StaffWalkInConsignmentWizard";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import { InquiryStatusBadge } from "../components/InquiryStatusBadge";
import { formatOfferTransactionLabel } from "../lib/format-offer-transaction-type";
import { formatPhpDisplay } from "../lib/format-php";

type InquiryRow = {
  id: string;
  sku: string;
  itemLabel: string;
  status: string;
  createdAt: string;
  consignorName: string;
  brand: string;
  category: string;
  itemModel: string;
  serialNumber: string;
  condition: string;
  inclusions: string;
  consentDirectPurchase: boolean;
  offerTransactionType: "consignment" | "direct_purchase" | null;
  offerPrice: string | null;
  isWalkIn: boolean;
};

type InquiryTab = "all" | "create";

const LEAVE_TAB_MSG =
  "You have unsaved changes to this consignment inquiry. Switch tabs anyway?";

type ClientAccountRow = {
  id: string;
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  contactNumber: string;
  createdAt: string;
};

function formatConsignorSummary(c: ClientAccountRow): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  const primary = name || c.username;
  return `${primary} · ${c.email}`;
}

function yesNo(v: boolean) {
  return v ? "Yes" : "No";
}

const columnHelper = createColumnHelper<InquiryRow>();

const inquiryColumns = [
  columnHelper.accessor("sku", {
    header: "SKU",
    cell: ({ getValue }) => (
      <span className="break-all font-mono text-[0.65rem] leading-snug text-slate-900 sm:text-xs dark:text-slate-100">
        {getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("consignorName", {
    header: "Consignor",
    cell: ({ getValue }) => (
      <span className="break-words font-medium text-slate-900 dark:text-slate-100">
        {getValue()}
      </span>
    ),
  }),
  columnHelper.accessor((row) => Boolean(row.isWalkIn), {
    id: "isWalkIn",
    header: () => (
      <span className="whitespace-normal leading-tight">Walk-in?</span>
    ),
    cell: ({ getValue }) => (
      <span className="block text-center text-slate-700 dark:text-slate-300">
        {yesNo(getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("brand", {
    header: "Brand",
    cell: ({ getValue }) => (
      <span className="break-words text-slate-800 dark:text-slate-200">
        {getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("category", {
    header: "Category",
    cell: ({ getValue }) => (
      <span className="break-words text-slate-800 dark:text-slate-200">
        {getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("itemModel", {
    header: "Model",
    cell: ({ getValue }) => (
      <span className="break-words text-slate-800 dark:text-slate-200">
        {getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("serialNumber", {
    header: "Serial",
    cell: ({ getValue }) => (
      <span className="break-all font-mono text-[0.7rem] text-slate-700 dark:text-slate-300">
        {getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("condition", {
    header: "Condition",
    cell: ({ row }) => (
      <span
        className="max-w-[10rem] break-words text-slate-700 dark:text-slate-300"
        title={
          row.original.condition !== "—" ? row.original.condition : undefined
        }
      >
        {row.original.condition}
      </span>
    ),
  }),
  columnHelper.accessor("inclusions", {
    header: "Inclusions",
    cell: ({ row }) => (
      <span
        className="max-w-[12rem] min-w-[7rem] whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300"
        title={
          row.original.inclusions !== "—" ? row.original.inclusions : undefined
        }
      >
        {row.original.inclusions}
      </span>
    ),
  }),
  columnHelper.accessor("status", {
    id: "status",
    header: "Status",
    cell: ({ row }) => <InquiryStatusBadge status={row.original.status} />,
  }),
  columnHelper.accessor("offerPrice", {
    header: () => <span title="Staff offer price (PHP)">Offer price</span>,
    cell: ({ getValue }) => (
      <span className="tabular-nums text-slate-800 dark:text-slate-200">
        {formatPhpDisplay(getValue())}
      </span>
    ),
  }),
  columnHelper.accessor(
    (row) => formatOfferTransactionLabel(row.offerTransactionType),
    {
      id: "offerTransactionType",
      header: "Transaction type",
      cell: ({ getValue }) => (
        <span className="text-slate-700 dark:text-slate-300">{getValue()}</span>
      ),
    },
  ),
  columnHelper.accessor((row) => yesNo(row.consentDirectPurchase), {
    id: "consentDirectPurchase",
    header: () => (
      <span className="whitespace-normal leading-tight">
        Allow Direct Purchase
      </span>
    ),
    cell: ({ getValue }) => (
      <span className="block text-center text-slate-700 dark:text-slate-300">
        {getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("createdAt", {
    id: "submitted",
    header: "Submitted",
    sortingFn: "alphanumeric",
    cell: ({ row }) => (
      <span className="text-slate-600 dark:text-slate-400">
        <SubmittedAtCell iso={row.original.createdAt} />
      </span>
    ),
  }),
];

export function InquiryPage() {
  const navigate = useNavigate();
  const { token } = usePortalAuth();
  const [tab, setTab] = useState<InquiryTab>("all");
  const [rows, setRows] = useState<InquiryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clients, setClients] = useState<ClientAccountRow[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [wizardDirty, setWizardDirty] = useState(false);

  const sortedClients = useMemo(() => {
    return [...clients].sort((a, b) => {
      const ln = a.lastName.localeCompare(b.lastName);
      if (ln !== 0) return ln;
      return a.firstName.localeCompare(b.firstName);
    });
  }, [clients]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) ?? null,
    [clients, selectedClientId],
  );

  const loadInquiries = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch("/api/inquiries", {}, token);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as InquiryRow[];
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inquiries");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (tab === "all") void loadInquiries();
  }, [tab, loadInquiries]);

  useEffect(() => {
    if (tab === "all") setWizardDirty(false);
  }, [tab]);

  useEffect(() => {
    if (tab !== "create" || !token) return;
    let cancelled = false;
    void (async () => {
      setClientsError(null);
      setClientsLoading(true);
      try {
        const res = await apiFetch("/api/accounts/clients", {}, token);
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = (await res.json()) as ClientAccountRow[];
        if (!cancelled) setClients(data);
      } catch (e) {
        if (!cancelled) {
          setClientsError(
            e instanceof Error ? e.message : "Failed to load client accounts",
          );
          setClients([]);
        }
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, token]);

  const tabBtn =
    "-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500";

  const consignorSelectField =
    "box-border h-11 min-h-11 w-full max-w-xl rounded-lg border border-slate-300 bg-white px-3 py-0 text-sm leading-5 text-slate-900 outline-none ring-violet-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

  const requestTab = (next: InquiryTab) => {
    if (tab === "create" && next === "all" && wizardDirty) {
      if (!window.confirm(LEAVE_TAB_MSG)) return;
    }
    setTab(next);
  };

  return (
    <div className="w-full min-w-0">
      <div
        className="mb-6 flex items-end gap-2 border-b border-slate-200 dark:border-slate-800"
        role="tablist"
        aria-label="Inquiry sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "all"}
          id="tab-all"
          aria-controls="panel-all"
          className={`${tabBtn} ${
            tab === "all"
              ? "border-violet-600 text-violet-700 dark:text-violet-300"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
          onClick={() => requestTab("all")}
        >
          All Inquiries
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "create"}
          id="tab-create"
          aria-controls="panel-create"
          className={`${tabBtn} ${
            tab === "create"
              ? "border-violet-600 text-violet-700 dark:text-violet-300"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
          onClick={() => requestTab("create")}
        >
          Create Inquiry
        </button>
      </div>

      {tab === "all" && (
        <section id="panel-all" role="tabpanel" aria-labelledby="tab-all">
          {error && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          )}

          <DataTable<InquiryRow>
            data={rows}
            columns={inquiryColumns}
            isLoading={loading}
            emptyMessage="No inquiries yet."
            hideEmptyState={!!error}
            getRowId={(row) => row.id}
            onRowClick={(row) => navigate(`/portal/inquiries/${row.id}`)}
            getRowAriaLabel={(row) =>
              `Inquiry ${row.sku}, ${row.itemLabel || "item"}`
            }
            tableClassName="w-full min-w-[1040px] table-fixed border-collapse text-left"
          />
        </section>
      )}

      {tab === "create" && (
        <section
          id="panel-create"
          role="tabpanel"
          aria-labelledby="tab-create"
          className="min-h-[12rem] max-w-3xl space-y-6"
        >
          <div>
            <label
              htmlFor="walk-in-consignor"
              className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-200"
            >
              Consignor (client account)
            </label>
            <select
              id="walk-in-consignor"
              className={consignorSelectField}
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              disabled={clientsLoading || !!clientsError}
              aria-busy={clientsLoading}
            >
              <option value="">
                {clientsLoading ? "Loading clients…" : "Select a consignor…"}
              </option>
              {sortedClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {formatConsignorSummary(c)}
                </option>
              ))}
            </select>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Walk-in consignments must be tied to an existing client account.
              The consignor needs to have registered in the app before you can
              create an inquiry on their behalf.
            </p>
            {clientsError && (
              <p
                className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                role="alert"
              >
                {clientsError}
              </p>
            )}
            {!clientsLoading && !clientsError && sortedClients.length === 0 && (
              <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
                No client accounts found. Register a client before recording a
                walk-in inquiry.
              </p>
            )}
          </div>

          {selectedClient && (
            <StaffWalkInConsignmentWizard
              key={selectedClient.id}
              portalToken={token}
              consignorClientId={selectedClient.id}
              onDirtyChange={setWizardDirty}
              onSubmitted={() => setTab("all")}
            />
          )}
        </section>
      )}
    </div>
  );
}
