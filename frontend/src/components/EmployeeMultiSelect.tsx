import { useEffect, useId, useMemo, useRef, useState } from 'react'

export type EmployeeOption = {
  id: string
  label: string
}

type Props = {
  label: string
  options: EmployeeOption[]
  selectedIds: string[]
  disabled?: boolean
  onChange: (nextIds: string[]) => void
  onBlocked?: (employeeLabel: string) => void
  /** IDs that cannot be selected (e.g. already in the other list). */
  blockedIds?: string[]
}

export function EmployeeMultiSelect({
  label,
  options,
  selectedIds,
  disabled,
  onChange,
  onBlocked,
  blockedIds = [],
}: Props) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const blockedSet = useMemo(() => new Set(blockedIds), [blockedIds])

  const selectedLabels = useMemo(
    () =>
      options
        .filter((o) => selectedSet.has(o.id))
        .map((o) => o.label),
    [options, selectedSet],
  )

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={rootRef} className="relative min-w-0">
      <p className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-400">
        {label}
      </p>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      >
        <span className="min-w-0 flex-1 truncate">
          {selectedLabels.length === 0
            ? 'Select employees…'
            : selectedLabels.join(', ')}
        </span>
        <span className="shrink-0 text-slate-400" aria-hidden>
          ▾
        </span>
      </button>
      {open && !disabled ? (
        <ul
          id={listId}
          role="listbox"
          aria-multiselectable
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">No employees</li>
          ) : (
            options.map((opt) => {
              const checked = selectedSet.has(opt.id)
              const blocked = blockedSet.has(opt.id) && !checked
              return (
                <li key={opt.id} role="option" aria-selected={checked}>
                  <label
                    className={[
                      'flex cursor-pointer items-start gap-2 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800',
                      blocked ? 'opacity-70' : '',
                    ].join(' ')}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={checked}
                      onChange={() => {
                        if (blocked) {
                          onBlocked?.(opt.label)
                          return
                        }
                        if (checked) {
                          onChange(selectedIds.filter((id) => id !== opt.id))
                        } else {
                          onChange([...selectedIds, opt.id])
                        }
                      }}
                    />
                    <span className="min-w-0 break-words text-slate-800 dark:text-slate-100">
                      {opt.label}
                    </span>
                  </label>
                </li>
              )
            })
          )}
        </ul>
      ) : null}
      {selectedLabels.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {options
            .filter((o) => selectedSet.has(o.id))
            .map((o) => (
              <span
                key={o.id}
                className="inline-flex max-w-full items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <span className="truncate">{o.label}</span>
                {!disabled ? (
                  <button
                    type="button"
                    className="shrink-0 text-slate-500 hover:text-slate-800 dark:hover:text-slate-100"
                    aria-label={`Remove ${o.label}`}
                    onClick={() =>
                      onChange(selectedIds.filter((id) => id !== o.id))
                    }
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ))}
        </div>
      ) : null}
    </div>
  )
}
