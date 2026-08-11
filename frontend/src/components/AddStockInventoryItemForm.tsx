import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type ConsignFormOptions = {
  brands: string[];
  categories: string[];
};

const STOCK_BRANCHES = ["Pasig", "Makati"] as const;
type StockBranch = (typeof STOCK_BRANCHES)[number];

export type StockInventoryItemFormData = {
  itemModel: string;
  brand: string;
  category: string;
  serialNumber: string;
  color: string;
  material: string;
  condition: string;
  inclusions: string;
  datePurchased: string;
  sourceOfPurchase: string;
  currentBranch: StockBranch | "";
  dateReceived: string;
};

export function emptyStockInventoryItemForm(): StockInventoryItemFormData {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return {
    itemModel: "",
    brand: "",
    category: "",
    serialNumber: "",
    color: "",
    material: "",
    condition: "",
    inclusions: "",
    datePurchased: "",
    sourceOfPurchase: "",
    currentBranch: "",
    dateReceived: `${yyyy}-${mm}-${dd}`,
  };
}

const field =
  "w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none ring-violet-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
const label =
  "mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300";
const optionalHint = " (Optional)";

type Props = {
  portalToken: string | null;
  onCreated: (result: { id: string; sku: string }) => void;
};

export function AddStockInventoryItemForm({
  portalToken,
  onCreated,
}: Props) {
  const [value, setValue] = useState<StockInventoryItemFormData>(() =>
    emptyStockInventoryItemForm(),
  );
  const [options, setOptions] = useState<ConsignFormOptions>({
    brands: [],
    categories: [],
  });
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const patch = useCallback((partial: Partial<StockInventoryItemFormData>) => {
    setValue((prev) => ({ ...prev, ...partial }));
  }, []);

  const loadOptions = useCallback(async () => {
    setOptionsError(null);
    setOptionsLoading(true);
    try {
      const res = await apiFetch(
        "/api/client/consignment-form/options",
        {},
        portalToken,
      );
      if (!res.ok) {
        throw new Error(`Could not load form options (${res.status})`);
      }
      const data = (await res.json()) as ConsignFormOptions;
      setOptions({
        brands: Array.isArray(data.brands) ? data.brands : [],
        categories: Array.isArray(data.categories) ? data.categories : [],
      });
    } catch (e) {
      setOptionsError(
        e instanceof Error ? e.message : "Could not load form options",
      );
    } finally {
      setOptionsLoading(false);
    }
  }, [portalToken]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!portalToken || submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch(
        "/api/inventory/stock",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            form: {
              itemModel: value.itemModel.trim(),
              brand: value.brand.trim(),
              category: value.category.trim(),
              serialNumber: value.serialNumber.trim(),
              color: value.color.trim(),
              material: value.material.trim(),
              condition: value.condition.trim(),
              inclusions: value.inclusions.trim(),
              datePurchased: value.datePurchased.trim(),
              sourceOfPurchase: value.sourceOfPurchase.trim(),
            },
            currentBranch: value.currentBranch,
            dateReceived: value.dateReceived,
          }),
        },
        portalToken,
      );
      if (!res.ok) {
        let message = `Could not add item (${res.status})`;
        try {
          const body = (await res.json()) as { message?: string | string[] };
          if (typeof body.message === "string") message = body.message;
          else if (Array.isArray(body.message))
            message = body.message.join(", ");
        } catch {
          /* keep default */
        }
        throw new Error(message);
      }
      const created = (await res.json()) as { id: string; sku: string };
      setValue(emptyStockInventoryItemForm());
      onCreated(created);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not add item");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="flex w-full max-w-xl flex-col gap-4"
    >
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Add stock item
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Create a company-owned inventory item without an inquiry or
          consignor. It will start in For Authentication.
        </p>
      </div>

      {optionsError ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {optionsError}
          <button
            type="button"
            onClick={() => void loadOptions()}
            className="ml-2 font-medium text-violet-700 underline dark:text-violet-300"
          >
            Retry
          </button>
        </p>
      ) : null}

      {submitError ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {submitError}
        </p>
      ) : null}

      <div>
        <label htmlFor="stock-item-model" className={label}>
          Item model
        </label>
        <input
          id="stock-item-model"
          type="text"
          autoComplete="off"
          value={value.itemModel}
          onChange={(e) => patch({ itemModel: e.target.value })}
          className={field}
          required
        />
      </div>

      <div>
        <label htmlFor="stock-brand" className={label}>
          Brand
        </label>
        <select
          id="stock-brand"
          value={value.brand}
          onChange={(e) => patch({ brand: e.target.value })}
          className={field}
          required
          disabled={optionsLoading}
        >
          <option value="">Select brand</option>
          {options.brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="stock-category" className={label}>
          Category
        </label>
        <select
          id="stock-category"
          value={value.category}
          onChange={(e) => patch({ category: e.target.value })}
          className={field}
          required
          disabled={optionsLoading}
        >
          <option value="">Select category</option>
          {options.categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="stock-serial" className={label}>
          Serial number{optionalHint}
        </label>
        <input
          id="stock-serial"
          type="text"
          autoComplete="off"
          value={value.serialNumber}
          onChange={(e) => patch({ serialNumber: e.target.value })}
          className={field}
        />
      </div>

      <div>
        <label htmlFor="stock-color" className={label}>
          Color{optionalHint}
        </label>
        <input
          id="stock-color"
          type="text"
          autoComplete="off"
          value={value.color}
          onChange={(e) => patch({ color: e.target.value })}
          className={field}
        />
      </div>

      <div>
        <label htmlFor="stock-material" className={label}>
          Material{optionalHint}
        </label>
        <input
          id="stock-material"
          type="text"
          autoComplete="off"
          value={value.material}
          onChange={(e) => patch({ material: e.target.value })}
          className={field}
        />
      </div>

      <div>
        <label htmlFor="stock-condition" className={label}>
          Condition
        </label>
        <input
          id="stock-condition"
          type="text"
          autoComplete="off"
          value={value.condition}
          onChange={(e) => patch({ condition: e.target.value })}
          className={field}
          required
        />
      </div>

      <div>
        <label htmlFor="stock-inclusions" className={label}>
          Inclusions
        </label>
        <textarea
          id="stock-inclusions"
          rows={3}
          value={value.inclusions}
          onChange={(e) => patch({ inclusions: e.target.value })}
          className={`${field} min-h-[5.5rem] resize-y py-2`}
          required
          placeholder="e.g. dust bag, box, authenticity card"
        />
      </div>

      <div>
        <label htmlFor="stock-date-purchased" className={label}>
          Date purchased{optionalHint}
        </label>
        <input
          id="stock-date-purchased"
          type="date"
          value={value.datePurchased}
          onChange={(e) => patch({ datePurchased: e.target.value })}
          className={field}
        />
      </div>

      <div>
        <label htmlFor="stock-source" className={label}>
          Source of purchase
        </label>
        <input
          id="stock-source"
          type="text"
          autoComplete="off"
          value={value.sourceOfPurchase}
          onChange={(e) => patch({ sourceOfPurchase: e.target.value })}
          className={field}
          required
          placeholder="e.g. Japan Trip"
        />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Shown as consignor: Stock -{" "}
          {value.sourceOfPurchase.trim() || "…"}
        </p>
      </div>

      <div>
        <label htmlFor="stock-branch" className={label}>
          Current branch
        </label>
        <select
          id="stock-branch"
          value={value.currentBranch}
          onChange={(e) =>
            patch({ currentBranch: e.target.value as StockBranch | "" })
          }
          className={field}
          required
        >
          <option value="">Select branch</option>
          {STOCK_BRANCHES.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="stock-date-received" className={label}>
          Date received
        </label>
        <input
          id="stock-date-received"
          type="date"
          value={value.dateReceived}
          onChange={(e) => patch({ dateReceived: e.target.value })}
          className={field}
          required
        />
      </div>

      <div className="pt-1">
        <button
          type="submit"
          disabled={submitting || !portalToken}
          className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Adding…" : "Add to inventory"}
        </button>
      </div>
    </form>
  );
}
