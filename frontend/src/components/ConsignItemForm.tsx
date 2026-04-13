import { useCallback, useEffect, useState } from "react";
import { useClientAuth } from "../context/client-auth";
import { apiFetch } from "../lib/api";
import type { ConsignItemFormData } from "../types/consign-inquiry";
import { TermsHtmlModal } from "./TermsHtmlModal";

const DIRECT_PURCHASE_TERMS_URL = "/terms/direct-purchase.txt";

type ConsignFormOptions = {
  brands: string[];
  categories: string[];
};

const field =
  "w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none ring-violet-500 focus:ring-2";
const label = "mb-1 block text-xs font-medium text-slate-700";
const optionalHint = " (Optional)";

type PrimaryAction = {
  label: string;
  onClick: () => void;
};

type Props = {
  value: ConsignItemFormData;
  onChange: (next: ConsignItemFormData) => void;
  primaryAction: PrimaryAction;
  /** When true, the submit button is disabled (e.g. inquiry item limit reached). */
  primaryDisabled?: boolean;
};

export function ConsignItemForm({
  value,
  onChange,
  primaryAction,
  primaryDisabled = false,
}: Props) {
  const { token } = useClientAuth();
  const [directPurchaseTermsOpen, setDirectPurchaseTermsOpen] = useState(false);

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
        token,
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
  }, [token]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  function onSubmitForm(e: React.FormEvent) {
    e.preventDefault();
    primaryAction.onClick();
  }

  return (
    <>
      <TermsHtmlModal
        open={directPurchaseTermsOpen}
        onClose={() => setDirectPurchaseTermsOpen(false)}
        url={DIRECT_PURCHASE_TERMS_URL}
        title="Direct purchase — terms and conditions"
      />
      <form onSubmit={onSubmitForm} className="flex flex-col gap-4">
        {optionsError && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {optionsError}
            <button
              type="button"
              onClick={() => void loadOptions()}
              className="ml-2 font-medium text-violet-700 underline"
            >
              Retry
            </button>
          </p>
        )}

        <div>
          <label htmlFor="consign-item-model" className={label}>
            Item model
          </label>
          <input
            id="consign-item-model"
            type="text"
            autoComplete="off"
            value={value.itemModel}
            onChange={(e) => patch({ itemModel: e.target.value })}
            className={field}
            required
          />
        </div>

        <div>
          <label htmlFor="consign-brand" className={label}>
            Brand
          </label>
          <select
            id="consign-brand"
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
            <p className="mt-1 text-xs text-slate-500">
              No brands configured yet. Staff can add options under Settings →
              Brands we consign.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="consign-category" className={label}>
            Category
          </label>
          <select
            id="consign-category"
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
            <p className="mt-1 text-xs text-slate-500">
              No categories configured yet. Staff can add options under Settings
              → Item categories.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="consign-serial" className={label}>
            Serial number{optionalHint}
          </label>
          <input
            id="consign-serial"
            type="text"
            autoComplete="off"
            value={value.serialNumber}
            onChange={(e) => patch({ serialNumber: e.target.value })}
            className={field}
          />
        </div>

        <div>
          <label htmlFor="consign-color" className={label}>
            Color{optionalHint}
          </label>
          <input
            id="consign-color"
            type="text"
            autoComplete="off"
            value={value.color}
            onChange={(e) => patch({ color: e.target.value })}
            className={field}
          />
        </div>

        <div>
          <label htmlFor="consign-material" className={label}>
            Material{optionalHint}
          </label>
          <input
            id="consign-material"
            type="text"
            autoComplete="off"
            value={value.material}
            onChange={(e) => patch({ material: e.target.value })}
            className={field}
          />
        </div>

        <div>
          <label htmlFor="consign-condition" className={label}>
            Condition
          </label>
          <input
            id="consign-condition"
            type="text"
            autoComplete="off"
            value={value.condition}
            onChange={(e) => patch({ condition: e.target.value })}
            className={field}
            required
          />
        </div>

        <div>
          <label htmlFor="consign-inclusions" className={label}>
            Inclusions
          </label>
          <textarea
            id="consign-inclusions"
            rows={3}
            value={value.inclusions}
            onChange={(e) => patch({ inclusions: e.target.value })}
            className={`${field} min-h-[5.5rem] resize-y py-2`}
            required
            placeholder="e.g. dust bag, box, authenticity card"
          />
        </div>

        <div>
          <label htmlFor="consign-date-purchased" className={label}>
            Date purchased{optionalHint}
          </label>
          <input
            id="consign-date-purchased"
            type="date"
            value={value.datePurchased}
            onChange={(e) => patch({ datePurchased: e.target.value })}
            className={field}
          />
        </div>

        <div>
          <label htmlFor="consign-source" className={label}>
            Source of purchase{optionalHint}
          </label>
          <input
            id="consign-source"
            type="text"
            autoComplete="off"
            value={value.sourceOfPurchase}
            onChange={(e) => patch({ sourceOfPurchase: e.target.value })}
            className={field}
            placeholder="e.g. boutique, reseller"
          />
        </div>

        <div>
          <label htmlFor="consign-instructions" className={label}>
            Special instructions{optionalHint}
          </label>
          <textarea
            id="consign-instructions"
            rows={3}
            value={value.specialInstructions}
            onChange={(e) => patch({ specialInstructions: e.target.value })}
            className={`${field} min-h-[5.5rem] resize-y py-2`}
          />
        </div>

        <div className="border-t border-slate-200 pt-4">
          <p className="mb-3 text-xs font-medium text-slate-700">Pricing</p>
          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor="consign-price-consignment" className={label}>
                Consignment selling price{optionalHint}
              </label>
              <input
                id="consign-price-consignment"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                autoComplete="off"
                value={value.consignmentSellingPrice}
                onChange={(e) =>
                  patch({ consignmentSellingPrice: e.target.value })
                }
                className={field}
                placeholder="0.00"
              />
            </div>
            <div>
              <label htmlFor="consign-price-direct" className={label}>
                Direct purchase selling price{optionalHint}
              </label>
              <input
                id="consign-price-direct"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                autoComplete="off"
                value={value.directPurchaseSellingPrice}
                onChange={(e) =>
                  patch({ directPurchaseSellingPrice: e.target.value })
                }
                className={field}
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-4">
          <p className="text-xs font-medium text-slate-700">Consents</p>
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-slate-800">
            <input
              type="checkbox"
              name="consentDirectPurchase"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-violet-600 focus:ring-2 focus:ring-violet-500"
              checked={value.consentDirectPurchase}
              onChange={(e) =>
                patch({ consentDirectPurchase: e.target.checked })
              }
            />
            <span>
              {optionalHint} I allow this item for direct purchase and read its{" "}
              <button
                type="button"
                className="font-medium text-violet-700 underline decoration-violet-400 underline-offset-2 hover:text-violet-900"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDirectPurchaseTermsOpen(true);
                }}
              >
                terms and conditions
              </button>
              .
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-slate-800">
            <input
              type="checkbox"
              name="consentPriceNomination"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-violet-600 focus:ring-2 focus:ring-violet-500"
              checked={value.consentPriceNomination}
              onChange={(e) =>
                patch({ consentPriceNomination: e.target.checked })
              }
              required
            />
            <span>
              I authorize The Bag Hub to nominate the item&apos;s price based on
              their market research.
            </span>
          </label>
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
    </>
  );
}
