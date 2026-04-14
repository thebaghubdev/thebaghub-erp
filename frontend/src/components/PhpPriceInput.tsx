import { parsePhpStringToNumber } from "../lib/format-php";

type PhpPriceInputProps = {
  id: string;
  "aria-label"?: string;
  value: string;
  onChange: (v: string) => void;
  /** Tailwind classes for the input (include border, text size, etc.). */
  className: string;
  disabled?: boolean;
  placeholder?: string;
  required?: boolean;
};

/**
 * Price field with ₱ prefix; normalizes to two decimal places on blur.
 */
export function PhpPriceInput({
  id,
  "aria-label": ariaLabel,
  value,
  onChange,
  className,
  disabled,
  placeholder = "0.00",
  required,
}: PhpPriceInputProps) {
  return (
    <div className="relative">
      <span
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-slate-500 dark:text-slate-400"
        aria-hidden
      >
        ₱
      </span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          const n = parsePhpStringToNumber(value);
          if (n != null && n >= 0) onChange(n.toFixed(2));
          else if (value.trim() === "") onChange("");
        }}
        className={`${className} pl-8`}
        placeholder={placeholder}
      />
    </div>
  );
}
