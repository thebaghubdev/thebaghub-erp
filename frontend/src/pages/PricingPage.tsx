import { createColumnHelper } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable } from "../components/data-table/DataTable";
import { InventoryStatusBadge } from "../components/InventoryStatusBadge";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import { branchLabel } from "../lib/consignment-schedule-labels";
import { formatOfferTransactionLabel } from "../lib/format-offer-transaction-type";
import {
  formatPhpAmount,
  formatPhpDisplay,
  parsePhpStringToNumber,
} from "../lib/format-php";

const PRICING_PAGE_STATUSES = new Set(["For Pricing", "For Editing"]);

const cellInputClass =
  "w-full min-h-8 max-w-[8.5rem] rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

const toolbarPrimaryBtn =
  "inline-flex shrink-0 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-900 transition-colors hover:bg-violet-100 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-100 dark:hover:bg-violet-900/80 sm:text-sm";

const toolbarMutedBtn =
  "inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 sm:text-sm";

type InventoryRow = {
  id: string;
  sku: string;
  dateReceived: string;
  inquiryId: string | null;
  consignorName: string | null;
  status: string;
  transactionType: string | null;
  currentBranch: string;
  itemLabel: string;
  inclusions: string;
  marketPrice: string | null;
  retailPrice: string | null;
  consignorPrice: string | null;
  tbhSellingPrice: string | null;
  assignedToName: string | null;
  authenticationStatus: string;
};

function normalizedStoredTbh(raw: string | null): string | null {
  if (raw == null || raw.trim() === "") return null;
  const n = parsePhpStringToNumber(raw);
  return n != null ? n.toFixed(2) : null;
}

function markupFromTbhAndConsignor(
  tbhSelling: string | null,
  consignorPrice: string | null,
): { markup: string; markupPercent: string } {
  const sell =
    tbhSelling != null && tbhSelling.trim() !== ""
      ? parsePhpStringToNumber(tbhSelling)
      : null;
  const cost =
    consignorPrice != null && consignorPrice.trim() !== ""
      ? parsePhpStringToNumber(consignorPrice)
      : null;
  if (sell == null || cost == null) {
    return { markup: "—", markupPercent: "—" };
  }
  const amount = sell - cost;
  if (cost === 0) {
    return { markup: formatPhpAmount(amount), markupPercent: "—" };
  }
  const pct = (amount / cost) * 100;
  return {
    markup: formatPhpAmount(amount),
    markupPercent: `${Math.round(pct)}%`,
  };
}

function markupPercentInputValue(
  tbhDraft: string,
  consignorPrice: string | null,
): string {
  const sell =
    tbhDraft.trim() === "" ? null : parsePhpStringToNumber(tbhDraft);
  const cost =
    consignorPrice != null && consignorPrice.trim() !== ""
      ? parsePhpStringToNumber(consignorPrice)
      : null;
  if (sell == null || cost == null || cost === 0) return "";
  const pct = ((sell - cost) / cost) * 100;
  return String(Math.round(pct));
}

/** Unrounded mark-up % vs consignor price; null if not meaningful. */
function markupPercentNumeric(
  tbhSelling: string | null,
  consignorPrice: string | null,
): number | null {
  const sell =
    tbhSelling != null && tbhSelling.trim() !== ""
      ? parsePhpStringToNumber(tbhSelling)
      : null;
  const cost =
    consignorPrice != null && consignorPrice.trim() !== ""
      ? parsePhpStringToNumber(consignorPrice)
      : null;
  if (sell == null || cost == null || cost === 0) return null;
  return ((sell - cost) / cost) * 100;
}

const columnHelper = createColumnHelper<InventoryRow>();

export function PricingPage() {
  const navigate = useNavigate();
  const { token } = usePortalAuth();
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pricingEditMode, setPricingEditMode] = useState(false);
  const [draftTbhById, setDraftTbhById] = useState<Record<string, string>>({});
  const [savingPricing, setSavingPricing] = useState(false);
  const [pricingSaveError, setPricingSaveError] = useState<string | null>(null);
  const [markupRangeWarningOpen, setMarkupRangeWarningOpen] = useState(false);
  const [markupWarningLines, setMarkupWarningLines] = useState<string[]>([]);
  const pendingPricingUpdatesRef = useRef<{ id: string; next: string | null }[]>(
    [],
  );

  /** Keeps column defs stable while typing so inputs are not remounted (loses focus). */
  const draftTbhByIdRef = useRef(draftTbhById);
  draftTbhByIdRef.current = draftTbhById;

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch("/api/inventory", {}, token);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as InventoryRow[];
      setRows(data.filter((r) => PRICING_PAGE_STATUSES.has(r.status)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inventory");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const beginPricingEdit = useCallback(() => {
    const initial: Record<string, string> = {};
    for (const r of rows) {
      const n = normalizedStoredTbh(r.tbhSellingPrice);
      initial[r.id] = n != null ? n : "";
    }
    setDraftTbhById(initial);
    setPricingSaveError(null);
    setPricingEditMode(true);
  }, [rows]);

  const closeMarkupRangeWarning = useCallback(() => {
    setMarkupRangeWarningOpen(false);
    pendingPricingUpdatesRef.current = [];
    setMarkupWarningLines([]);
  }, []);

  const cancelPricingEdit = useCallback(() => {
    closeMarkupRangeWarning();
    setPricingEditMode(false);
    setDraftTbhById({});
    setPricingSaveError(null);
  }, [closeMarkupRangeWarning]);

  const performPricingSave = useCallback(
    async (updates: { id: string; next: string | null }[]) => {
      if (!token || updates.length === 0) return;
      setSavingPricing(true);
      try {
        for (const u of updates) {
          const res = await apiFetch(
            `/api/inventory/${u.id}/pricing`,
            {
              method: "PATCH",
              body: JSON.stringify({ tbhSellingPrice: u.next }),
            },
            token,
          );
          if (!res.ok) {
            const msg =
              res.status === 400
                ? "Invalid price or item cannot be updated."
                : `Save failed (${res.status})`;
            throw new Error(msg);
          }
        }
        await load();
        setPricingEditMode(false);
        setDraftTbhById({});
      } catch (e) {
        setPricingSaveError(
          e instanceof Error ? e.message : "Failed to save pricing",
        );
      } finally {
        setSavingPricing(false);
      }
    },
    [token, load],
  );

  const confirmMarkupRangeWarning = useCallback(async () => {
    const updates = [...pendingPricingUpdatesRef.current];
    setMarkupRangeWarningOpen(false);
    pendingPricingUpdatesRef.current = [];
    setMarkupWarningLines([]);
    await performPricingSave(updates);
  }, [performPricingSave]);

  const savePricing = useCallback(async () => {
    if (!token) return;
    setPricingSaveError(null);
    const updates: { id: string; next: string | null }[] = [];
    for (const r of rows) {
      const draftRaw = draftTbhById[r.id] ?? "";
      let draftNorm: string | null;
      if (draftRaw.trim() === "") {
        draftNorm = null;
      } else {
        draftNorm = normalizedStoredTbh(draftRaw);
        if (draftNorm === null) {
          setPricingSaveError(
            `Enter a valid TBH selling price for ${r.sku}, or clear the field.`,
          );
          return;
        }
      }
      const origNorm = normalizedStoredTbh(r.tbhSellingPrice);
      const same =
        (draftNorm == null && origNorm == null) ||
        (draftNorm != null && origNorm != null && draftNorm === origNorm);
      if (!same) {
        updates.push({ id: r.id, next: draftNorm });
      }
    }
    if (updates.length === 0) {
      setPricingEditMode(false);
      setDraftTbhById({});
      return;
    }

    const markupOutliers: string[] = [];
    for (const u of updates) {
      if (u.next == null) continue;
      const row = rows.find((x) => x.id === u.id);
      if (!row) continue;
      const pct = markupPercentNumeric(u.next, row.consignorPrice);
      if (pct == null) continue;
      if (pct < 10 || pct > 40) {
        markupOutliers.push(`${row.sku} (${Math.round(pct)}% mark-up)`);
      }
    }
    if (markupOutliers.length > 0) {
      pendingPricingUpdatesRef.current = updates;
      setMarkupWarningLines(markupOutliers);
      setMarkupRangeWarningOpen(true);
      return;
    }

    await performPricingSave(updates);
  }, [token, rows, draftTbhById, performPricingSave]);

  const columns = useMemo(() => {
    return [
      columnHelper.accessor("sku", {
        header: "SKU",
        cell: ({ getValue }) => (
          <span className="break-all font-mono text-[0.65rem] leading-snug text-slate-900 sm:text-xs dark:text-slate-100">
            {getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("marketPrice", {
        header: () => (
          <span title="From authentication snapshot">Market price</span>
        ),
        cell: ({ getValue }) => (
          <span className="tabular-nums text-slate-800 dark:text-slate-200">
            {formatPhpDisplay(getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("retailPrice", {
        header: () => (
          <span title="From authentication snapshot">Retail price</span>
        ),
        cell: ({ getValue }) => (
          <span className="tabular-nums text-slate-800 dark:text-slate-200">
            {formatPhpDisplay(getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("consignorPrice", {
        header: () => (
          <span title="Staff offer on linked inquiry (PHP)">Consignor price</span>
        ),
        cell: ({ getValue }) => (
          <span className="tabular-nums text-slate-800 dark:text-slate-200">
            {formatPhpDisplay(getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("tbhSellingPrice", {
        header: () => (
          <span title="TBH listed selling price (PHP)">TBH selling price</span>
        ),
        cell: ({ row }) => {
          if (!pricingEditMode) {
            return (
              <span className="tabular-nums text-slate-800 dark:text-slate-200">
                {formatPhpDisplay(row.original.tbhSellingPrice)}
              </span>
            );
          }
          const id = row.original.id;
          const value = draftTbhByIdRef.current[id] ?? "";
          return (
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              aria-label={`TBH selling price for ${row.original.sku}`}
              value={value}
              onChange={(e) => {
                const v = e.target.value;
                setDraftTbhById((prev) => ({ ...prev, [id]: v }));
              }}
              onClick={(e) => e.stopPropagation()}
              placeholder="0.00"
              className={cellInputClass}
            />
          );
        },
      }),
      columnHelper.display({
        id: "markup",
        header: () => (
          <span title="TBH selling price minus consignor price">Mark-up</span>
        ),
        cell: ({ row }) => {
          const tbhEffective = pricingEditMode
            ? (draftTbhByIdRef.current[row.original.id] ?? "").trim() === ""
              ? null
              : draftTbhByIdRef.current[row.original.id]
            : row.original.tbhSellingPrice;
          const { markup } = markupFromTbhAndConsignor(
            tbhEffective,
            row.original.consignorPrice,
          );
          return (
            <span className="tabular-nums text-slate-800 dark:text-slate-200">
              {markup}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: "markupPercent",
        header: () => (
          <span title="Mark-up as a percent of consignor price">Mark-up %</span>
        ),
        cell: ({ row }) => {
          if (!pricingEditMode) {
            const { markupPercent } = markupFromTbhAndConsignor(
              row.original.tbhSellingPrice,
              row.original.consignorPrice,
            );
            return (
              <span className="tabular-nums text-slate-800 dark:text-slate-200">
                {markupPercent}
              </span>
            );
          }
          const id = row.original.id;
          const draft = draftTbhByIdRef.current[id] ?? "";
          const cost = parsePhpStringToNumber(row.original.consignorPrice ?? "");
          const pctEditable = cost != null && cost !== 0;
          const pctDisplay = markupPercentInputValue(
            draft,
            row.original.consignorPrice,
          );
          return (
            <div className="flex items-center gap-0.5">
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                disabled={!pctEditable}
                title={
                  !pctEditable
                    ? "Needs a non-zero consignor price to edit mark-up %"
                    : undefined
                }
                aria-label={`Mark-up percent for ${row.original.sku}`}
                value={pctDisplay}
                onChange={(e) => {
                  if (!pctEditable || cost == null) return;
                  const raw = e.target.value.replace(/%/g, "").trim();
                  if (raw === "") {
                    setDraftTbhById((prev) => ({
                      ...prev,
                      [id]: "",
                    }));
                    return;
                  }
                  const p = Number(raw);
                  if (!Number.isFinite(p)) return;
                  const newTbh = cost * (1 + p / 100);
                  setDraftTbhById((prev) => ({
                    ...prev,
                    [id]: newTbh.toFixed(2),
                  }));
                }}
                onClick={(e) => e.stopPropagation()}
                className={`${cellInputClass} max-w-[5.5rem] disabled:cursor-not-allowed disabled:opacity-50`}
              />
              <span className="text-slate-500 dark:text-slate-400">%</span>
            </div>
          );
        },
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: ({ row }) => (
          <InventoryStatusBadge status={row.original.status} />
        ),
      }),
      columnHelper.accessor("itemLabel", {
        header: "Item",
        cell: ({ getValue }) => (
          <span className="break-words text-slate-800 dark:text-slate-200">
            {getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("inclusions", {
        header: "Inclusions",
        cell: ({ row }) => (
          <span
            className="max-w-[14rem] min-w-[7rem] whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300"
            title={
              row.original.inclusions !== "—"
                ? row.original.inclusions
                : undefined
            }
          >
            {row.original.inclusions}
          </span>
        ),
      }),
      columnHelper.accessor("dateReceived", {
        header: "Date received",
        cell: ({ getValue }) => <SubmittedAtCell iso={getValue()} />,
      }),
      columnHelper.accessor("consignorName", {
        header: "Consignor",
        cell: ({ getValue }) => (
          <span className="break-words font-medium text-slate-900 dark:text-slate-100">
            {getValue() ?? "—"}
          </span>
        ),
      }),
      columnHelper.accessor("transactionType", {
        header: "Transaction",
        cell: ({ row }) => (
          <span className="text-slate-700 dark:text-slate-300">
            {formatOfferTransactionLabel(
              row.original.transactionType as
                | "consignment"
                | "direct_purchase"
                | null,
            )}
          </span>
        ),
      }),
      columnHelper.accessor("currentBranch", {
        header: "Branch",
        cell: ({ getValue }) => (
          <span className="text-slate-700 dark:text-slate-300">
            {branchLabel(getValue())}
          </span>
        ),
      }),
    ];
  }, [pricingEditMode]);

  const toolbarRight = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {pricingEditMode ? (
        <>
          <button
            type="button"
            className={toolbarMutedBtn}
            disabled={savingPricing}
            onClick={() => cancelPricingEdit()}
          >
            Cancel
          </button>
          <button
            type="button"
            className={toolbarPrimaryBtn}
            disabled={savingPricing}
            onClick={() => void savePricing()}
          >
            {savingPricing ? "Saving…" : "Save pricing"}
          </button>
        </>
      ) : (
        <button
          type="button"
          className={toolbarPrimaryBtn}
          disabled={loading || rows.length === 0}
          onClick={() => beginPricingEdit()}
        >
          Update pricing
        </button>
      )}
    </div>
  );

  return (
    <div className="w-full min-w-0">
      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}
      {pricingSaveError ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {pricingSaveError}
        </p>
      ) : null}

      <ConfirmDialog
        open={markupRangeWarningOpen}
        title="Mark-up outside usual range"
        description={
          <>
            <p className="mb-2">
              {markupWarningLines.length === 1
                ? "This item has mark-up outside the usual 10%–40% range:"
                : "These items have mark-up outside the usual 10%–40% range:"}
            </p>
            <ul className="mb-3 max-h-[min(40vh,16rem)] list-disc space-y-1.5 overflow-y-auto pl-5 [overflow-wrap:anywhere]">
              {markupWarningLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            <p>Save anyway?</p>
          </>
        }
        cancelLabel="Go back"
        confirmLabel="Save anyway"
        onCancel={closeMarkupRangeWarning}
        onConfirm={confirmMarkupRangeWarning}
      />

      <DataTable
        data={rows}
        columns={columns}
        isLoading={loading}
        emptyMessage="No items are currently For Pricing or For Editing."
        hideEmptyState={!!error}
        getRowId={(r) => r.id}
        onRowClick={
          pricingEditMode ? undefined : (r) => navigate(`/portal/inventory/${r.id}`)
        }
        getRowAriaLabel={(r) => `Inventory item ${r.sku}, ${r.itemLabel}`}
        toolbarRight={toolbarRight}
      />
    </div>
  );
}
