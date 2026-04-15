import { createColumnHelper } from "@tanstack/react-table";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "../components/data-table/DataTable";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import { formatInquiryStatus } from "../lib/format-inquiry-status";
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
  consignmentSellingPrice: string;
  directPurchaseSellingPrice: string;
  consentDirectPurchase: boolean;
  offerTransactionType: "consignment" | "direct_purchase" | null;
  offerPrice: string | null;
};

type InquiryTab = "all" | "create";

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
  columnHelper.accessor((row) => formatInquiryStatus(row.status), {
    id: "status",
    header: "Status",
    cell: ({ getValue }) => (
      <span className="capitalize text-slate-700 dark:text-slate-300">
        {getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("offerPrice", {
    header: () => <span title="Staff offer price (PHP)">Offer price</span>,
    cell: ({ getValue }) => (
      <span className="tabular-nums text-slate-800 dark:text-slate-200">
        {formatPhpDisplay(getValue())}
      </span>
    ),
  }),
  columnHelper.accessor((row) => formatOfferTransactionLabel(row.offerTransactionType), {
    id: "offerTransactionType",
    header: "Transaction type",
    cell: ({ getValue }) => (
      <span className="text-slate-700 dark:text-slate-300">{getValue()}</span>
    ),
  }),
  columnHelper.accessor("consignmentSellingPrice", {
    header: () => (
      <span title="Consignment selling price (PHP)">
        Consignment Selling Price
      </span>
    ),
    cell: ({ getValue }) => (
      <span className="tabular-nums text-slate-800 dark:text-slate-200">
        {formatPhpDisplay(getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("directPurchaseSellingPrice", {
    header: () => (
      <span title="Direct purchase price (PHP)">
        Direct Purchase Selling Price
      </span>
    ),
    cell: ({ getValue }) => (
      <span className="tabular-nums text-slate-800 dark:text-slate-200">
        {formatPhpDisplay(getValue())}
      </span>
    ),
  }),
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

  const tabBtn =
    "-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500";

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
          onClick={() => setTab("all")}
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
          onClick={() => setTab("create")}
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
            tableClassName="w-full min-w-[1180px] table-fixed border-collapse text-left"
          />
        </section>
      )}

      {tab === "create" && (
        <section
          id="panel-create"
          role="tabpanel"
          aria-labelledby="tab-create"
          className="min-h-[12rem]"
        />
      )}
    </div>
  );
}
