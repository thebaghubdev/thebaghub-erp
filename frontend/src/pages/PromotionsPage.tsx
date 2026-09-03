import { createColumnHelper } from "@tanstack/react-table";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable } from "../components/data-table/DataTable";
import { DatePickerField } from "../components/DatePickerField";
import { usePortalAuth } from "../context/portal-auth";
import { useUnsavedChangesGuard } from "../context/unsaved-changes";
import { apiFetch } from "../lib/api";
import { formatPhpDisplay } from "../lib/format-php";
import {
  computePromoFromBulkDiscount,
  formatPromoPrice,
  parsePhpAmount,
  validatePromoPriceAgainstSelling,
} from "../lib/promotion-pricing";
import {
  formatPromotionDate,
  promotionLifecycleBadgeClass,
  promotionLifecycleLabel,
  type PromotionLifecycleStatus,
} from "../lib/promotions-display";
import { branchLabel } from "../lib/consignment-schedule-labels";
import { useFeatureAccess } from "../lib/use-feature-access";

type PromotionsTab = "list" | "create";

type PromotionListRow = {
  id: string;
  promotionName: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  createdByName: string;
  itemCount: number;
  lifecycleStatus: PromotionLifecycleStatus;
};

type PromotionItemRow = {
  id: string;
  inventoryItemId: string;
  sku: string;
  itemLabel: string;
  currentBranch: string;
  tbhSellingPrice: string | null;
  promoPrice: string | null;
};

type PromotionDetail = PromotionListRow & { items: PromotionItemRow[] };

type InventoryPickerRow = {
  id: string;
  sku: string;
  itemLabel: string;
  status: string;
  currentBranch: string;
  tbhSellingPrice: string | null;
};

type PricingRow = InventoryPickerRow & {
  promoPrice: string;
};

const fieldClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

const dateTriggerClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";

const tabBtn =
  "-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500";

const listColumnHelper = createColumnHelper<PromotionListRow>();

const promotionListColumns = [
  listColumnHelper.accessor("promotionName", {
    header: "Promotion",
    cell: ({ getValue }) => (
      <span className="font-medium text-slate-900 dark:text-slate-100">
        {getValue()}
      </span>
    ),
  }),
  listColumnHelper.accessor("startDate", {
    header: "Start",
    cell: ({ getValue }) => formatPromotionDate(getValue()),
  }),
  listColumnHelper.accessor("endDate", {
    header: "End",
    cell: ({ getValue }) => formatPromotionDate(getValue()),
  }),
  listColumnHelper.accessor("lifecycleStatus", {
    header: "Status",
    cell: ({ getValue }) => {
      const status = getValue();
      return (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${promotionLifecycleBadgeClass(status)}`}
        >
          {promotionLifecycleLabel(status)}
        </span>
      );
    },
  }),
  listColumnHelper.accessor("itemCount", {
    header: "Items",
    cell: ({ getValue }) => getValue(),
  }),
  listColumnHelper.accessor("createdByName", {
    header: "Created by",
  }),
];

const detailColumnHelper = createColumnHelper<PromotionItemRow>();

const promotionDetailColumns = [
  detailColumnHelper.accessor("sku", {
    header: "SKU",
    cell: ({ getValue }) => (
      <span className="font-mono text-xs text-slate-900 dark:text-slate-100">
        {getValue()}
      </span>
    ),
  }),
  detailColumnHelper.accessor("itemLabel", { header: "Item" }),
  detailColumnHelper.accessor("tbhSellingPrice", {
    header: "Selling price",
    cell: ({ getValue }) => formatPhpDisplay(getValue()),
  }),
  detailColumnHelper.accessor("promoPrice", {
    header: "Promo price",
    cell: ({ getValue }) => formatPhpDisplay(getValue()),
  }),
];

function compareYmd(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function PromoPriceInput({
  inventoryId,
  value,
  onChange,
}: {
  inventoryId: string;
  value: string;
  onChange: (inventoryId: string, promoPrice: string) => void;
}) {
  return (
    <input
      type="number"
      min={0}
      step="0.01"
      className="w-28 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
      value={value}
      onChange={(e) => onChange(inventoryId, e.target.value)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

export function PromotionsPage() {
  const { token } = usePortalAuth();
  const { canEdit, readOnly } = useFeatureAccess("promotions");
  const startDateId = useId();
  const endDateId = useId();

  const [tab, setTab] = useState<PromotionsTab>("list");
  const [rows, setRows] = useState<PromotionListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<PromotionDetail | null>(null);

  const [cancelTarget, setCancelTarget] = useState<PromotionListRow | null>(
    null,
  );
  const [cancelBusy, setCancelBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLifecycle, setEditLifecycle] =
    useState<PromotionLifecycleStatus | null>(null);

  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [promotionName, setPromotionName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [inventoryRows, setInventoryRows] = useState<InventoryPickerRow[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(
    () => new Set(),
  );
  const [pricingRows, setPricingRows] = useState<PricingRow[]>([]);
  const [pricingSelected, setPricingSelected] = useState<Set<string>>(
    () => new Set(),
  );
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [submitBusy, setSubmitBusy] = useState(false);

  const createDirty =
    tab === "create" &&
    (promotionName.trim() !== "" ||
      startDate !== "" ||
      endDate !== "" ||
      pickerSelected.size > 0 ||
      pricingRows.length > 0 ||
      wizardStep !== 1 ||
      editingId != null);

  useUnsavedChangesGuard({
    isDirty: createDirty,
    bypass: submitBusy,
    description:
      "You have unsaved changes to this promotion. Leave this page?",
  });

  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkDiscountType, setBulkDiscountType] = useState<"percent" | "value">(
    "percent",
  );
  const [bulkAmount, setBulkAmount] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [tabLeaveOpen, setTabLeaveOpen] = useState(false);

  const onPromoPriceChange = useCallback(
    (inventoryId: string, promoPrice: string) => {
      setPricingRows((rows) =>
        rows.map((r) => (r.id === inventoryId ? { ...r, promoPrice } : r)),
      );
    },
    [],
  );

  const pricingRowIdKey = useMemo(
    () => pricingRows.map((r) => r.id).join("\0"),
    [pricingRows],
  );

  const pricingRowIds = useMemo(
    () => (pricingRowIdKey ? pricingRowIdKey.split("\0") : []),
    [pricingRowIdKey],
  );

  const isActiveEdit = editLifecycle === "active";

  const loadPromotions = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch("/api/promotions", {}, token);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as PromotionListRow[];
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load promotions");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (tab === "list") void loadPromotions();
  }, [tab, loadPromotions]);

  const resetWizard = useCallback(() => {
    setEditingId(null);
    setEditLifecycle(null);
    setWizardStep(1);
    setPromotionName("");
    setStartDate("");
    setEndDate("");
    setInventoryRows([]);
    setPickerSelected(new Set());
    setPricingRows([]);
    setPricingSelected(new Set());
    setWizardError(null);
  }, []);

  const loadInventoryForWizard = useCallback(async () => {
    setInventoryLoading(true);
    try {
      const qs = editingId
        ? `?excludePromotionId=${encodeURIComponent(editingId)}`
        : "";
      const res = await apiFetch(
        `/api/promotions/available-inventory${qs}`,
        {},
        token,
      );
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as InventoryPickerRow[];
      setInventoryRows(data);
    } catch (e) {
      setWizardError(
        e instanceof Error ? e.message : "Failed to load inventory",
      );
      setInventoryRows([]);
    } finally {
      setInventoryLoading(false);
    }
  }, [token, editingId]);

  useEffect(() => {
    if (tab === "create" && wizardStep === 2 && !isActiveEdit) {
      void loadInventoryForWizard();
    }
  }, [tab, wizardStep, loadInventoryForWizard, isActiveEdit]);

  const openDetail = useCallback(
    async (id: string) => {
      setDetailOpen(true);
      setDetailLoading(true);
      setDetail(null);
      try {
        const res = await apiFetch(`/api/promotions/${id}`, {}, token);
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        setDetail((await res.json()) as PromotionDetail);
      } catch (e) {
        setDetail(null);
        setError(
          e instanceof Error ? e.message : "Failed to load promotion details",
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [token],
  );

  const beginEdit = useCallback(
    async (row: PromotionListRow) => {
      if (!canEdit) return;
      if (
        row.lifecycleStatus === "ended" ||
        row.lifecycleStatus === "cancelled"
      ) {
        return;
      }
      setTab("create");
      resetWizard();
      setEditingId(row.id);
      setEditLifecycle(row.lifecycleStatus);
      setWizardError(null);
      setSubmitBusy(true);
      try {
        const res = await apiFetch(`/api/promotions/${row.id}`, {}, token);
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = (await res.json()) as PromotionDetail;
        setPromotionName(data.promotionName);
        setStartDate(data.startDate);
        setEndDate(data.endDate);
        const pricing: PricingRow[] = data.items.map((item) => ({
          id: item.inventoryItemId,
          sku: item.sku,
          itemLabel: item.itemLabel,
          status: "Available For Purchase",
          currentBranch: item.currentBranch,
          tbhSellingPrice: item.tbhSellingPrice,
          promoPrice: item.promoPrice ?? "",
        }));
        setPricingRows(pricing);
        setPickerSelected(new Set(pricing.map((p) => p.id)));
        if (row.lifecycleStatus === "active") {
          setInventoryRows(pricing.map(({ promoPrice: _p, ...rest }) => rest));
        } else {
          setWizardStep(1);
        }
      } catch (e) {
        setWizardError(
          e instanceof Error ? e.message : "Failed to load promotion",
        );
        setTab("list");
      } finally {
        setSubmitBusy(false);
      }
    },
    [canEdit, token, resetWizard],
  );

  const step1Valid =
    promotionName.trim() !== "" &&
    startDate !== "" &&
    endDate !== "" &&
    compareYmd(endDate, startDate) >= 0;

  const goToStep3 = useCallback(() => {
    const selected = inventoryRows.filter((r) => pickerSelected.has(r.id));
    setPricingRows((prev) => {
      const prevById = new Map(prev.map((r) => [r.id, r.promoPrice]));
      return selected.map((r) => ({
        ...r,
        promoPrice: prevById.get(r.id) ?? "",
      }));
    });
    setPricingSelected(new Set());
    setWizardStep(3);
  }, [inventoryRows, pickerSelected]);

  const allPricingValid = useMemo(() => {
    if (pricingRows.length === 0) return false;
    return pricingRows.every((row) => {
      const selling = parsePhpAmount(row.tbhSellingPrice);
      const promo = parsePhpAmount(row.promoPrice);
      if (selling == null || promo == null) return false;
      return validatePromoPriceAgainstSelling(selling, promo) == null;
    });
  }, [pricingRows]);

  const handleSubmit = useCallback(async () => {
    if (!canEdit) return;
    if (!allPricingValid) {
      setWizardError("Set a valid promo price for every item.");
      return;
    }
    setWizardError(null);
    setSubmitBusy(true);
    try {
      const body = {
        promotionName: promotionName.trim(),
        startDate,
        endDate,
        items: pricingRows.map((r) => ({
          inventoryItemId: r.id,
          promoPrice: formatPromoPrice(parsePhpAmount(r.promoPrice)!),
        })),
      };
      const res = await apiFetch(
        editingId ? `/api/promotions/${editingId}` : "/api/promotions",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        token,
      );
      if (!res.ok) {
        let message = `Request failed (${res.status})`;
        try {
          const errBody = (await res.json()) as { message?: unknown };
          if (typeof errBody.message === "string") message = errBody.message;
          else if (Array.isArray(errBody.message)) {
            message = errBody.message.join(" ");
          }
        } catch {
          // keep fallback
        }
        throw new Error(message);
      }
      resetWizard();
      setTab("list");
      void loadPromotions();
    } catch (e) {
      setWizardError(
        e instanceof Error ? e.message : "Failed to save promotion",
      );
    } finally {
      setSubmitBusy(false);
    }
  }, [
    canEdit,
    allPricingValid,
    promotionName,
    startDate,
    endDate,
    pricingRows,
    editingId,
    token,
    resetWizard,
    loadPromotions,
  ]);

  const confirmCancel = useCallback(async () => {
    if (!canEdit || !cancelTarget) return;
    setCancelBusy(true);
    try {
      const res = await apiFetch(
        `/api/promotions/${cancelTarget.id}/cancel`,
        { method: "POST" },
        token,
      );
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setCancelTarget(null);
      void loadPromotions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel promotion");
    } finally {
      setCancelBusy(false);
    }
  }, [canEdit, cancelTarget, token, loadPromotions]);

  const applyBulkDiscount = useCallback(() => {
    if (!canEdit) return;
    setBulkError(null);
    const amount = Number.parseFloat(bulkAmount);
    if (!Number.isFinite(amount)) {
      setBulkError("Enter a valid amount");
      return;
    }
    if (pricingSelected.size === 0) return;

    let firstError: string | null = null;
    const next = pricingRows.map((row) => {
      if (!pricingSelected.has(row.id)) return row;
      const selling = parsePhpAmount(row.tbhSellingPrice);
      if (selling == null) {
        firstError = firstError ?? "Missing selling price on an item";
        return row;
      }
      const result = computePromoFromBulkDiscount(
        bulkDiscountType,
        amount,
        selling,
      );
      if ("error" in result) {
        firstError = firstError ?? result.error;
        return row;
      }
      return { ...row, promoPrice: formatPromoPrice(result.promoPrice) };
    });
    if (firstError) {
      setBulkError(firstError);
      return;
    }
    setPricingRows(next);
    setBulkModalOpen(false);
    setBulkAmount("");
  }, [canEdit, bulkAmount, bulkDiscountType, pricingRows, pricingSelected]);

  const pickerColumns = useMemo(
    () => [
      createColumnHelper<InventoryPickerRow>().display({
        id: "select",
        header: () => {
          const allIds = inventoryRows.map((r) => r.id);
          const allSelected =
            allIds.length > 0 && allIds.every((id) => pickerSelected.has(id));
          return (
            <input
              type="checkbox"
              aria-label="Select all items"
              checked={allSelected}
              disabled={isActiveEdit}
              onChange={() => {
                if (isActiveEdit) return;
                setPickerSelected(allSelected ? new Set() : new Set(allIds));
              }}
            />
          );
        },
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label={`Select ${row.original.itemLabel}`}
            checked={pickerSelected.has(row.original.id)}
            disabled={isActiveEdit}
            onChange={() => {
              if (isActiveEdit) return;
              setPickerSelected((prev) => {
                const next = new Set(prev);
                if (next.has(row.original.id)) next.delete(row.original.id);
                else next.add(row.original.id);
                return next;
              });
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ),
      }),
      createColumnHelper<InventoryPickerRow>().accessor("sku", {
        header: "SKU",
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{getValue()}</span>
        ),
      }),
      createColumnHelper<InventoryPickerRow>().accessor("itemLabel", {
        header: "Item",
      }),
      createColumnHelper<InventoryPickerRow>().accessor("currentBranch", {
        header: "Branch",
        cell: ({ getValue }) => branchLabel(getValue()),
      }),
      createColumnHelper<InventoryPickerRow>().accessor("tbhSellingPrice", {
        header: "Selling price",
        cell: ({ getValue }) => formatPhpDisplay(getValue()),
      }),
    ],
    [inventoryRows, pickerSelected, isActiveEdit],
  );

  const pricingColumns = useMemo(
    () => [
      createColumnHelper<PricingRow>().display({
        id: "select",
        header: () => {
          const allSelected =
            pricingRowIds.length > 0 &&
            pricingRowIds.every((id) => pricingSelected.has(id));
          return (
            <input
              type="checkbox"
              aria-label="Select all items"
              checked={allSelected}
              onChange={() => {
                setPricingSelected(
                  allSelected ? new Set() : new Set(pricingRowIds),
                );
              }}
            />
          );
        },
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label={`Select ${row.original.itemLabel}`}
            checked={pricingSelected.has(row.original.id)}
            onChange={() => {
              setPricingSelected((prev) => {
                const next = new Set(prev);
                if (next.has(row.original.id)) next.delete(row.original.id);
                else next.add(row.original.id);
                return next;
              });
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ),
      }),
      createColumnHelper<PricingRow>().accessor("sku", {
        header: "SKU",
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{getValue()}</span>
        ),
      }),
      createColumnHelper<PricingRow>().accessor("itemLabel", {
        header: "Item",
      }),
      createColumnHelper<PricingRow>().accessor("tbhSellingPrice", {
        header: "Selling price",
        cell: ({ getValue }) => formatPhpDisplay(getValue()),
      }),
      createColumnHelper<PricingRow>().accessor("promoPrice", {
        header: "Promo price",
        cell: ({ row, getValue }) => (
          <PromoPriceInput
            inventoryId={row.original.id}
            value={getValue()}
            onChange={onPromoPriceChange}
          />
        ),
      }),
    ],
    [onPromoPriceChange, pricingSelected, pricingRowIds, pricingRowIdKey],
  );

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
        description="You have unsaved changes to this promotion. Switch tabs anyway?"
        cancelLabel="Stay"
        confirmLabel="Switch tab"
        onCancel={() => setTabLeaveOpen(false)}
        onConfirm={() => {
          setTab("list");
          resetWizard();
          setTabLeaveOpen(false);
        }}
      />
      <div
        className="mb-6 flex items-end gap-2 border-b border-slate-200 dark:border-slate-800"
        role="tablist"
        aria-label="Promotions sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "list"}
          id="tab-promotions-list"
          aria-controls="panel-promotions-list"
          className={`${tabBtn} ${
            tab === "list"
              ? "border-violet-600 text-violet-700 dark:text-violet-300"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
          onClick={() => {
            if (tab === "create" && createDirty) {
              setTabLeaveOpen(true);
              return;
            }
            setTab("list");
            resetWizard();
          }}
        >
          Promotions
        </button>
        {!readOnly ? (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "create"}
            id="tab-promotions-create"
            aria-controls="panel-promotions-create"
            className={`${tabBtn} ${
              tab === "create"
                ? "border-violet-600 text-violet-700 dark:text-violet-300"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            }`}
            onClick={() => {
              setTab("create");
              if (!editingId) resetWizard();
            }}
          >
            {editingId ? "Edit promotion" : "Create promotion"}
          </button>
        ) : null}
      </div>

      {tab === "list" && (
        <section
          id="panel-promotions-list"
          role="tabpanel"
          aria-labelledby="tab-promotions-list"
        >
          {error ? (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            >
              {error}
            </p>
          ) : null}
          <DataTable
            tableId="promotions-list"
            data={rows}
            columns={promotionListColumns}
            isLoading={loading}
            emptyMessage="No promotions yet."
            hideEmptyState={!!error}
            getRowId={(r) => r.id}
            onRowClick={(r) => void openDetail(r.id)}
            getRowAriaLabel={(r) => `Promotion ${r.promotionName}`}
            paginationItemLabel="promotions"
          />
        </section>
      )}

      {tab === "create" && !readOnly && (
        <section
          id="panel-promotions-create"
          role="tabpanel"
          aria-labelledby="tab-promotions-create"
          className="max-w-4xl space-y-6"
        >
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Step {wizardStep} of 3 —{" "}
            {wizardStep === 1
              ? "Promotion details"
              : wizardStep === 2
                ? "Select items"
                : "Set promo prices"}
          </p>

          {wizardError ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            >
              {wizardError}
            </p>
          ) : null}

          {wizardStep === 1 && (
            <div className="grid max-w-xl gap-4">
              <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                Promotion name
                <input
                  type="text"
                  className={fieldClass}
                  value={promotionName}
                  onChange={(e) => setPromotionName(e.target.value)}
                />
              </label>
              <div>
                <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                  Start date
                </span>
                <DatePickerField
                  id={startDateId}
                  value={startDate}
                  onChange={(v) => {
                    setStartDate(v);
                    if (endDate && compareYmd(endDate, v) < 0) {
                      setEndDate("");
                    }
                  }}
                  triggerClassName={dateTriggerClass}
                  disablePast
                  disabled={isActiveEdit}
                />
              </div>
              <div>
                <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                  End date
                </span>
                <DatePickerField
                  id={endDateId}
                  value={endDate}
                  onChange={setEndDate}
                  triggerClassName={dateTriggerClass}
                  disabled={!startDate}
                  disablePast={!startDate}
                  minDateYmd={startDate || undefined}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  disabled={!step1Valid}
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    if (isActiveEdit) setWizardStep(3);
                    else setWizardStep(2);
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="space-y-4">
              {isActiveEdit ? (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Items cannot be changed while a promotion is active.
                </p>
              ) : null}
              <DataTable
                tableId="promotions-picker"
                data={inventoryRows}
                columns={pickerColumns}
                isLoading={inventoryLoading}
                emptyMessage="No items available for purchase."
                getRowId={(r) => r.id}
                paginationItemLabel="items"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 dark:border-slate-600 dark:text-slate-200"
                  onClick={() => setWizardStep(1)}
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={pickerSelected.size === 0}
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={goToStep3}
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {wizardStep === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  disabled={pricingSelected.size === 0}
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    setBulkError(null);
                    setBulkModalOpen(true);
                  }}
                >
                  Update price
                </button>
              </div>
              <DataTable
                tableId="promotions-pricing"
                data={pricingRows}
                columns={pricingColumns}
                isLoading={false}
                emptyMessage="No items selected."
                getRowId={(r) => r.id}
                paginationItemLabel="items"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 dark:border-slate-600 dark:text-slate-200"
                  onClick={() => setWizardStep(isActiveEdit ? 1 : 2)}
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={!allPricingValid || submitBusy}
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void handleSubmit()}
                >
                  {submitBusy
                    ? "Saving…"
                    : editingId
                      ? "Save promotion"
                      : "Create promotion"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {detailOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setDetailOpen(false);
              }}
            >
              <div
                role="dialog"
                aria-modal
                aria-labelledby="promotion-detail-title"
                className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h2
                      id="promotion-detail-title"
                      className="text-lg font-semibold text-slate-900 dark:text-slate-100"
                    >
                      {detail?.promotionName ?? "Promotion items"}
                    </h2>
                    {detail ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {formatPromotionDate(detail.startDate)} –{" "}
                          {formatPromotionDate(detail.endDate)}
                        </p>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${promotionLifecycleBadgeClass(detail.lifecycleStatus)}`}
                        >
                          {promotionLifecycleLabel(detail.lifecycleStatus)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!readOnly &&
                    detail &&
                    detail.lifecycleStatus !== "ended" &&
                    detail.lifecycleStatus !== "cancelled" ? (
                      <button
                        type="button"
                        className="rounded-lg border border-violet-200 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950/40"
                        onClick={() => {
                          setDetailOpen(false);
                          void beginEdit(detail);
                        }}
                      >
                        Edit
                      </button>
                    ) : null}
                    {!readOnly &&
                    detail &&
                    detail.lifecycleStatus !== "ended" &&
                    detail.lifecycleStatus !== "cancelled" ? (
                      <button
                        type="button"
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                        onClick={() => {
                          setCancelTarget(detail);
                          setDetailOpen(false);
                        }}
                      >
                        Cancel promotion
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                      onClick={() => setDetailOpen(false)}
                    >
                      Close
                    </button>
                  </div>
                </div>
                {detailLoading ? (
                  <p className="text-sm text-slate-600">Loading…</p>
                ) : detail ? (
                  <DataTable
                    tableId="promotion-detail-items"
                    data={detail.items}
                    columns={promotionDetailColumns}
                    isLoading={false}
                    emptyMessage="No items in this promotion."
                    getRowId={(r) => r.id}
                    paginationItemLabel="items"
                  />
                ) : (
                  <p className="text-sm text-red-700">
                    Could not load details.
                  </p>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}

      {bulkModalOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setBulkModalOpen(false);
              }}
            >
              <div
                role="dialog"
                aria-modal
                aria-labelledby="bulk-discount-title"
                className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
              >
                <h2
                  id="bulk-discount-title"
                  className="text-lg font-semibold text-slate-900 dark:text-slate-100"
                >
                  Update price
                </h2>
                {bulkError ? (
                  <p className="mt-2 text-sm text-red-700">{bulkError}</p>
                ) : null}
                <div className="mt-4 space-y-3">
                  <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                    Discount type
                    <select
                      className={fieldClass}
                      value={bulkDiscountType}
                      onChange={(e) =>
                        setBulkDiscountType(
                          e.target.value as "percent" | "value",
                        )
                      }
                    >
                      <option value="percent">Percent</option>
                      <option value="value">Value</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                    Amount
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className={fieldClass}
                      value={bulkAmount}
                      onChange={(e) => setBulkAmount(e.target.value)}
                    />
                  </label>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600"
                    onClick={() => setBulkModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
                    onClick={applyBulkDiscount}
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      <ConfirmDialog
        open={cancelTarget != null}
        title="Cancel promotion?"
        description={
          cancelTarget
            ? `Cancel “${cancelTarget.promotionName}”? It will stay in the list as Cancelled.${
                cancelTarget.lifecycleStatus === "active"
                  ? " Active promo pricing will be cleared from included items."
                  : ""
              }`
            : ""
        }
        confirmLabel="Cancel promotion"
        danger
        busy={cancelBusy}
        onConfirm={() => void confirmCancel()}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
