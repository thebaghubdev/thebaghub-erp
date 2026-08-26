import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type SearchableSelectProps = {
  id: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  className: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
};

export function SearchableSelect({
  id,
  value,
  options,
  onChange,
  className,
  placeholder = "Select…",
  disabled = false,
  required = false,
}: SearchableSelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [popoverPosition, setPopoverPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const allOptions = useMemo(() => {
    if (value && !options.includes(value)) return [value, ...options];
    return options;
  }, [options, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q === value.trim().toLowerCase()) return allOptions;
    return allOptions.filter((option) => option.toLowerCase().includes(q));
  }, [allOptions, query, value]);

  const updatePopoverPosition = useCallback(() => {
    const trigger = inputRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const maxListHeight = 224;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top =
      spaceBelow >= Math.min(maxListHeight, 160)
        ? rect.bottom + 4
        : Math.max(8, rect.top - maxListHeight - 4);
    setPopoverPosition({ top, left: rect.left, width: rect.width });
  }, []);

  useEffect(() => {
    if (!open) {
      setPopoverPosition(null);
      return;
    }
    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [open, updatePopoverPosition, filtered.length]);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      const target = e.target as Node;
      if (
        rootRef.current?.contains(target) ||
        listRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
      setQuery("");
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = filtered.findIndex((option) => option === value);
    setHighlight(selectedIndex >= 0 ? selectedIndex : 0);
  }, [filtered, open, value]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector("[data-highlighted='true']");
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [highlight, open]);

  const commit = useCallback(
    (next: string) => {
      onChange(next);
      setQuery("");
      setOpen(false);
    },
    [onChange],
  );

  const displayValue = open ? query : value;

  return (
    <div ref={rootRef} className="relative w-full">
      <input
        tabIndex={-1}
        aria-hidden
        required={required}
        value={value}
        onChange={() => undefined}
        onFocus={() => inputRef.current?.focus()}
        className="sr-only"
      />
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && filtered[highlight] ? `${listId}-opt-${highlight}` : undefined
        }
        autoComplete="off"
        disabled={disabled}
        aria-required={required || undefined}
        placeholder={placeholder}
        value={displayValue}
        onFocus={(e) => {
          if (disabled) return;
          setOpen(true);
          setQuery(value);
          e.currentTarget.select();
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHighlight((i) =>
              filtered.length === 0 ? 0 : Math.min(i + 1, filtered.length - 1),
            );
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setHighlight((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            if (open && filtered[highlight]) {
              e.preventDefault();
              commit(filtered[highlight]);
            }
          } else if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
            setQuery("");
          }
        }}
        className={className}
      />
      {open && popoverPosition && typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              className="fixed z-[200] max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
              style={{
                top: popoverPosition.top,
                left: popoverPosition.left,
                width: popoverPosition.width,
              }}
            >
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
                  No matches
                </li>
              ) : (
                filtered.map((option, index) => {
                  const selected = option === value;
                  const highlighted = index === highlight;
                  return (
                    <li
                      key={option}
                      id={`${listId}-opt-${index}`}
                      role="option"
                      aria-selected={selected}
                      data-highlighted={highlighted ? "true" : undefined}
                      className={[
                        "cursor-pointer px-3 py-2 text-sm",
                        highlighted
                          ? "bg-violet-50 text-violet-900 dark:bg-violet-950/60 dark:text-violet-100"
                          : "text-slate-800 dark:text-slate-200",
                        selected ? "font-medium" : "",
                      ].join(" ")}
                      onMouseEnter={() => setHighlight(index)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        commit(option);
                      }}
                    >
                      {option}
                    </li>
                  );
                })
              )}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
