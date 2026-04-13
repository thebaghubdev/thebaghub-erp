/** Date on first line, time on second — avoids clipping in narrow table columns. */
export function SubmittedAtCell({ iso }: { iso: string }) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return <span className="break-all">{iso}</span>
  }

  const dateLine = d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  const timeLine = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <div className="flex flex-col gap-0.5">
      <span className="leading-tight text-slate-900 dark:text-slate-100">
        {dateLine}
      </span>
      <span className="tabular-nums text-xs leading-tight text-slate-500 sm:text-sm dark:text-slate-400">
        {timeLine}
      </span>
    </div>
  )
}
