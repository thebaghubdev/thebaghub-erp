import { useCallback, useEffect, useState } from 'react'
import { HorizontalScrollMirror } from './HorizontalScrollMirror'
import { SubmittedAtCell } from './SubmittedAtCell'
import { TablePaginationBar } from './TablePaginationBar'
import { useClientAuth } from '../context/client-auth'
import { apiFetch } from '../lib/api'
import { useClientPagination } from '../hooks/useClientPagination'
import {
  branchLabel,
  modeOfTransferLabel,
} from '../lib/consignment-schedule-labels'

type ClientScheduleRow = {
  id: string
  deliveryDate: string
  status: string
  modeOfTransfer: string
  branch: string
  inquiryCount: number
  skus: string[]
  createdAt: string
}

function formatScheduleStatus(status: string): string {
  const s = status.trim().toLowerCase()
  if (s === 'scheduled') return 'Scheduled'
  if (s === 'received') return 'Received'
  if (s === 'cancelled') return 'Cancelled'
  return status
}

async function readApiErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown }
    const m = body.message
    if (typeof m === 'string') return m
    if (Array.isArray(m)) return m.join(', ')
  } catch {
    /* ignore */
  }
  return `Request failed (${res.status})`
}

type Props = {
  refreshKey?: number
  onCreateSchedule?: () => void
}

export function ClientMySchedulesPanel({
  refreshKey = 0,
  onCreateSchedule,
}: Props) {
  const { token } = useClientAuth()
  const [rows, setRows] = useState<ClientScheduleRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pagination = useClientPagination(rows)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await apiFetch('/api/client/consignment-schedules', {}, token)
      if (!res.ok) throw new Error(await readApiErrorMessage(res))
      const data = (await res.json()) as ClientScheduleRow[]
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Failed to load your schedules',
      )
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          View your delivery schedules or create a new one.
        </p>
        {onCreateSchedule ? (
          <button
            type="button"
            onClick={onCreateSchedule}
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700"
          >
            Create schedule
          </button>
        ) : null}
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
          <button
            type="button"
            className="ml-2 font-medium text-violet-700 underline"
            onClick={() => void load()}
          >
            Retry
          </button>
        </p>
      )}

      <div className="max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50/80 px-3 py-3 sm:px-4">
          <TablePaginationBar
            totalCount={pagination.totalCount}
            pageIndex={pagination.pageIndex}
            pageSize={pagination.pageSize}
            onPageIndexChange={pagination.setPageIndex}
            onPageSizeChange={pagination.setPageSize}
            disabled={loading && rows.length === 0}
            itemLabel="schedules"
          />
        </div>
        <HorizontalScrollMirror>
          <table className="w-max min-w-full border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-2 py-2.5 sm:px-4 sm:py-3">
                  Delivery date
                </th>
                <th scope="col" className="px-2 py-2.5 sm:px-4 sm:py-3">
                  Branch
                </th>
                <th scope="col" className="px-2 py-2.5 sm:px-4 sm:py-3">
                  Mode
                </th>
                <th scope="col" className="px-2 py-2.5 sm:px-4 sm:py-3">
                  Items
                </th>
                <th scope="col" className="px-2 py-2.5 sm:px-4 sm:py-3">
                  Status
                </th>
                <th scope="col" className="px-2 py-2.5 sm:px-4 sm:py-3">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && !error && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No delivery schedules yet. Use &quot;Create schedule&quot; to
                    book one.
                  </td>
                </tr>
              )}
              {pagination.pageItems.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <SubmittedAtCell iso={row.deliveryDate} showTime={false} />
                  </td>
                  <td className="px-4 py-3 text-slate-800">
                    {branchLabel(row.branch)}
                  </td>
                  <td className="px-4 py-3 text-slate-800">
                    {modeOfTransferLabel('delivery', row.modeOfTransfer)}
                  </td>
                  <td className="px-4 py-3 text-slate-800">
                    <span className="font-medium">{row.inquiryCount}</span>
                    {row.skus.length > 0 ? (
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {row.skus.join(', ')}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-800">
                    {formatScheduleStatus(row.status)}
                  </td>
                  <td className="px-4 py-3 text-slate-800">
                    <SubmittedAtCell iso={row.createdAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </HorizontalScrollMirror>
      </div>
    </section>
  )
}
