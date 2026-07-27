import {
  EMPTY_ORDER_PICKUP_FORM,
  type OrderPickupFormValues,
} from "../lib/order-pickup-form";

const fieldClassName =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500";

type OrderPickupFormFieldsProps = {
  values: OrderPickupFormValues;
  onChange: (values: OrderPickupFormValues) => void;
  disabled?: boolean;
  /** Staff portal dark mode */
  variant?: "client" | "staff";
};

export function OrderPickupFormFields({
  values,
  onChange,
  disabled = false,
  variant = "client",
}: OrderPickupFormFieldsProps) {
  const selectClassName =
    variant === "staff"
      ? `${fieldClassName} dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100`
      : fieldClassName;

  const labelClassName =
    variant === "staff"
      ? "text-xs font-medium text-slate-500 dark:text-slate-400"
      : "text-xs font-medium text-slate-500";

  const setOption = (pickupOption: string) => {
    onChange({
      pickupOption,
      pickupBranch: "",
      courierService: "",
    });
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <span className={labelClassName}>Pick-up option</span>
        <select
          value={values.pickupOption}
          onChange={(e) => setOption(e.target.value)}
          disabled={disabled}
          className={selectClassName}
          required
        >
          <option value="">Select…</option>
          <option value="store_pickup">Store pick-up</option>
          <option value="courier_delivery">Courier delivery</option>
          <option value="in_store_purchase">In-store purchase</option>
        </select>
      </label>

      {values.pickupOption === "store_pickup" ||
      values.pickupOption === "in_store_purchase" ? (
        <label className="block">
          <span className={labelClassName}>Branch</span>
          <select
            value={values.pickupBranch}
            onChange={(e) =>
              onChange({ ...values, pickupBranch: e.target.value })
            }
            disabled={disabled}
            className={selectClassName}
            required
          >
            <option value="">Select…</option>
            <option value="makati">Makati</option>
            <option value="pasig">Pasig</option>
          </select>
        </label>
      ) : null}

      {values.pickupOption === "courier_delivery" ? (
        <label className="block">
          <span className={labelClassName}>Courier service</span>
          <select
            value={values.courierService}
            onChange={(e) =>
              onChange({ ...values, courierService: e.target.value })
            }
            disabled={disabled}
            className={selectClassName}
            required
          >
            <option value="">Select…</option>
            <option value="lbc">LBC</option>
            <option value="third_party">Third-party</option>
          </select>
        </label>
      ) : null}
    </div>
  );
}

export { EMPTY_ORDER_PICKUP_FORM };
