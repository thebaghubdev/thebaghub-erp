import { useEffect, useId } from 'react'
import { createPortal } from 'react-dom'

export type UnsavedConsignmentDraftDialogProps = {
  open: boolean
  saveBusy?: boolean
  onStay: () => void
  onSave: () => void | Promise<void>
  onLeaveWithoutSaving: () => void
}

export function UnsavedConsignmentDraftDialog({
  open,
  saveBusy = false,
  onStay,
  onSave,
  onLeaveWithoutSaving,
}: UnsavedConsignmentDraftDialogProps) {
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saveBusy) onStay()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, saveBusy, onStay])

  if (!open || typeof document === 'undefined') return null

  const busy = saveBusy

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center p-4 sm:items-center"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="Dismiss"
        disabled={busy}
        onClick={() => !busy && onStay()}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2
          id={titleId}
          className="text-base font-semibold text-slate-900 dark:text-slate-100"
        >
          Unsaved draft
        </h2>
        <p
          id={descId}
          className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400"
        >
          You have unsaved changes to your consignment draft. Save them before
          leaving, or choose to leave without saving.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onStay}
            className="order-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 sm:order-1 sm:w-auto dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Stay
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onLeaveWithoutSaving}
            className="order-2 w-full rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-800 hover:bg-red-50 disabled:opacity-50 sm:w-auto dark:border-red-900 dark:bg-slate-950 dark:text-red-200 dark:hover:bg-red-950/40"
          >
            Leave without saving
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSave()}
            className="order-1 w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50 sm:order-3 sm:w-auto dark:bg-violet-600 dark:hover:bg-violet-500"
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
