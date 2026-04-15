import { useEffect, useId, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { format, parse, startOfDay } from "date-fns";
import "react-day-picker/style.css";

function parseYmd(s: string): Date | undefined {
  if (!s.trim()) return undefined;
  const d = parse(s, "yyyy-MM-dd", new Date());
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export type DatePickerFieldProps = {
  id: string;
  value: string;
  /** Called with `yyyy-MM-dd` when the user selects a day. */
  onChange: (isoDateYmd: string) => void;
  triggerClassName: string;
  disabled?: boolean;
  /** Shown on the trigger when `value` is empty. */
  placeholder?: string;
  /** Accessible name for the calendar popover (`role="dialog"`). */
  dialogAriaLabel?: string;
  /** When true, days before today (local calendar) cannot be selected. */
  disablePast?: boolean;
};

const dayPickerClassNames = {
  months: "flex flex-col sm:flex-row gap-4",
  month: "space-y-2",
  month_caption: "flex justify-center pt-1 relative items-center w-full",
  caption_label:
    "text-sm font-semibold text-slate-900 dark:text-slate-100",
  nav: "flex items-center gap-1",
  button_previous:
    "absolute left-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
  button_next:
    "absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
  month_grid: "border-collapse",
  weekdays: "flex",
  weekday:
    "w-9 text-[0.7rem] font-medium uppercase text-slate-500 dark:text-slate-400",
  week: "mt-1 flex w-full",
  day: "group relative h-9 w-9 p-0 text-center text-sm",
  day_button:
    "inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-800 hover:bg-violet-100 hover:text-violet-900 dark:text-slate-200 dark:hover:bg-violet-950 dark:hover:text-violet-100",
  selected:
    "font-semibold [&_button]:bg-violet-600 [&_button]:text-white [&_button]:hover:bg-violet-600 [&_button]:hover:text-white dark:[&_button]:bg-violet-600",
  today: "font-semibold text-violet-700 dark:text-violet-300",
  outside: "text-slate-300 dark:text-slate-600",
  disabled: "text-slate-300 dark:text-slate-600",
  hidden: "invisible",
} as const;

/**
 * Popover day picker: value is `yyyy-MM-dd`; uses the same control pattern for forms (staff registration, schedules, etc.).
 */
export function DatePickerField({
  id,
  value,
  onChange,
  triggerClassName,
  disabled,
  placeholder = "Select date",
  dialogAriaLabel = "Choose date",
  disablePast = false,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const selected = parseYmd(value);
  const displayLabel = selected
    ? format(selected, "MMM d, yyyy")
    : placeholder;

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`${triggerClassName} flex w-full cursor-pointer items-center justify-between text-left`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
      >
        <span className={value ? "" : "text-slate-400 dark:text-slate-500"}>
          {displayLabel}
        </span>
        <span className="ml-2 text-slate-400 dark:text-slate-500" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div
          id={dialogId}
          role="dialog"
          aria-label={dialogAriaLabel}
          className="absolute left-0 top-full z-30 mt-1 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <DayPicker
            mode="single"
            required={false}
            selected={selected}
            onSelect={(d) => {
              if (d) {
                onChange(format(d, "yyyy-MM-dd"));
              }
              setOpen(false);
            }}
            defaultMonth={selected ?? new Date()}
            disabled={
              disablePast ? { before: startOfDay(new Date()) } : undefined
            }
            classNames={dayPickerClassNames}
          />
        </div>
      )}
    </div>
  );
}
