import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import type { ConsignItemFormData } from "../types/consign-inquiry";
import { PhpPriceInput } from "./PhpPriceInput";

type ConsignFormOptions = {
  brands: string[];
  categories: string[];
};

const field =
  "w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none ring-violet-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
const label =
  "mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300";
const optionalHint = " (Optional)";

type PrimaryAction = {
  label: string;
  onClick: () => void;
};

type Props = {
  value: ConsignItemFormData;
  onChange: (next: ConsignItemFormData) => void;
  primaryAction: PrimaryAction;
  primaryDisabled?: boolean;
  /** Staff portal JWT — loads picklists from the same API as the client form. */
  portalToken: string | null;
};

export function StaffWalkInConsignmentItemForm({
  value,
  onChange,
  primaryAction,
  primaryDisabled = false,
  portalToken,
}: Props) {
  const [options, setOptions] = useState<ConsignFormOptions>({
    brands: [],
    categories: [],
  });
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const patch = useCallback(
    (partial: Partial<ConsignItemFormData>) => {
      onChange({ ...value, ...partial });
    },
    [onChange, value],
  );

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

  function onSubmitForm(e: React.FormEvent) {
    e.preventDefault();
    primaryAction.onClick();
  }

  return (
    <form onSubmit={onSubmitForm} className="flex flex-col gap-4">
        {optionsError && (
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
        )}

        <div>
          <label htmlFor="staff-walkin-item-model" className={label}>
            Item model
          </label>
          <input
            id="staff-walkin-item-model"
            type="text"
            autoComplete="off"
            value={value.itemModel}
            onChange={(e) => patch({ itemModel: e.target.value })}
            className={field}
            required
          />
        </div>

        <div>
          <label htmlFor="staff-walkin-brand" className={label}>
            Brand
          </label>
          <select
            id="staff-walkin-brand"
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
          {!optionsLoading && options.brands.length === 0 && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              No brands configured yet. Staff can add options under Settings →
              Brands we consign.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="staff-walkin-category" className={label}>
            Category
          </label>
          <select
            id="staff-walkin-category"
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
          {!optionsLoading && options.categories.length === 0 && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              No categories configured yet. Staff can add options under Settings
              → Item categories.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="staff-walkin-serial" className={label}>
            Serial number{optionalHint}
          </label>
          <input
            id="staff-walkin-serial"
            type="text"
            autoComplete="off"
            value={value.serialNumber}
            onChange={(e) => patch({ serialNumber: e.target.value })}
            className={field}
          />
        </div>

        <div>
          <label htmlFor="staff-walkin-color" className={label}>
            Color{optionalHint}
          </label>
          <input
            id="staff-walkin-color"
            type="text"
            autoComplete="off"
            value={value.color}
            onChange={(e) => patch({ color: e.target.value })}
            className={field}
          />
        </div>

        <div>
          <label htmlFor="staff-walkin-material" className={label}>
            Material{optionalHint}
          </label>
          <input
            id="staff-walkin-material"
            type="text"
            autoComplete="off"
            value={value.material}
            onChange={(e) => patch({ material: e.target.value })}
            className={field}
          />
        </div>

        <div>
          <label htmlFor="staff-walkin-condition" className={label}>
            Condition
          </label>
          <input
            id="staff-walkin-condition"
            type="text"
            autoComplete="off"
            value={value.condition}
            onChange={(e) => patch({ condition: e.target.value })}
            className={field}
            required
          />
        </div>

        <div>
          <label htmlFor="staff-walkin-inclusions" className={label}>
            Inclusions
          </label>
          <textarea
            id="staff-walkin-inclusions"
            rows={3}
            value={value.inclusions}
            onChange={(e) => patch({ inclusions: e.target.value })}
            className={`${field} min-h-[5.5rem] resize-y py-2`}
            required
            placeholder="e.g. dust bag, box, authenticity card"
          />
        </div>

        <div>
          <label htmlFor="staff-walkin-date-purchased" className={label}>
            Date purchased{optionalHint}
          </label>
          <input
            id="staff-walkin-date-purchased"
            type="date"
            value={value.datePurchased}
            onChange={(e) => patch({ datePurchased: e.target.value })}
            className={field}
          />
        </div>

        <div>
          <label htmlFor="staff-walkin-source" className={label}>
            Source of purchase{optionalHint}
          </label>
          <input
            id="staff-walkin-source"
            type="text"
            autoComplete="off"
            value={value.sourceOfPurchase}
            onChange={(e) => patch({ sourceOfPurchase: e.target.value })}
            className={field}
            placeholder="e.g. boutique, reseller"
          />
        </div>

        <div>
          <label htmlFor="staff-walkin-instructions" className={label}>
            Special instructions{optionalHint}
          </label>
          <textarea
            id="staff-walkin-instructions"
            rows={3}
            value={value.specialInstructions}
            onChange={(e) => patch({ specialInstructions: e.target.value })}
            className={`${field} min-h-[5.5rem] resize-y py-2`}
          />
        </div>

        <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
          <p className="mb-3 text-xs font-medium text-slate-700 dark:text-slate-300">
            Pricing
          </p>
          <div className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="staff-walkin-price-consignment"
                className={label}
              >
                Consignment selling price{optionalHint}
              </label>
              <PhpPriceInput
                id="staff-walkin-price-consignment"
                value={value.consignmentSellingPrice}
                onChange={(v) => patch({ consignmentSellingPrice: v })}
                className={field.replace("px-3", "pr-3")}
                placeholder="0.00"
              />
            </div>
            <div>
              <label htmlFor="staff-walkin-price-direct" className={label}>
                Direct purchase selling price{optionalHint}
              </label>
              <PhpPriceInput
                id="staff-walkin-price-direct"
                value={value.directPurchaseSellingPrice}
                onChange={(v) => patch({ directPurchaseSellingPrice: v })}
                className={field.replace("px-3", "pr-3")}
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        <div className="pt-1">
          <button
            type="submit"
            disabled={primaryDisabled}
            className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {primaryAction.label}
          </button>
        </div>
    </form>
  );
}
