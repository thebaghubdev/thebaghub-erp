import { useCallback, useEffect, useState } from 'react'
import { SubmittedAtCell } from '../components/SubmittedAtCell'
import { usePortalAuth } from '../context/portal-auth'
import { apiFetch } from '../lib/api'

type InquiryRow = {
  id: string
  sku: string
  itemLabel: string
  status: string
  createdAt: string
}

type InquiryTab = 'all' | 'create'

export function InquiryPage() {
  const { token } = usePortalAuth()
  const [tab, setTab] = useState<InquiryTab>('all')
  const [rows, setRows] = useState<InquiryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadInquiries = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await apiFetch('/api/inquiries', {}, token)
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const data = (await res.json()) as InquiryRow[]
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load inquiries')
    } finally {
      setLoading(false)
    }
  }, [token])
  useEffect(() => {
    if (tab === 'all') void loadInquiries()
  }, [tab, loadInquiries])

  const tabBtn =
    'rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500'

  return (
    <div className="w-full min-w-0">
      <div
        className="mb-6 flex gap-2 border-b border-slate-200 dark:border-slate-800"
        role="tablist"
        aria-label="Inquiry sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'all'}
          id="tab-all"
          aria-controls="panel-all"
          className={`${tabBtn} ${
            tab === 'all'
              ? 'border-b-2 border-violet-600 text-violet-700 dark:text-violet-300'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
          }`}
          onClick={() => setTab('all')}
        >
          All Inquiries
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'create'}
          id="tab-create"
          aria-controls="panel-create"
          className={`${tabBtn} ${
            tab === 'create'
              ? 'border-b-2 border-violet-600 text-violet-700 dark:text-violet-300'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
          }`}
          onClick={() => setTab('create')}
        >
          Create Inquiry
        </button>
      </div>

      {tab === 'all' && (
        <section id="panel-all" role="tabpanel" aria-labelledby="tab-all">
          {error && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          )}

          <div className="max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full table-fixed border-collapse text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
                  <tr>
                    <th
                      scope="col"
                      className="min-w-0 w-[22%] px-2 py-2.5 sm:w-[20%] sm:px-4 sm:py-3"
                    >
                      SKU
                    </th>
                    <th
                      scope="col"
                      className="min-w-0 w-[38%] px-2 py-2.5 sm:w-[40%] sm:px-4 sm:py-3"
                    >
                      Item
                    </th>
                    <th
                      scope="col"
                      className="w-[18%] px-2 py-2.5 sm:px-4 sm:py-3"
                    >
                      Status
                    </th>
                    <th
                      scope="col"
                      className="min-w-0 w-[22%] px-2 py-2.5 sm:w-[20%] sm:px-4 sm:py-3"
                    >
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {loading && rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-8 text-center text-slate-500"
                      >
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!loading && rows.length === 0 && !error && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-8 text-center text-slate-500"
                      >
                        No inquiries yet.
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <td className="min-w-0 break-all px-2 py-2.5 align-top font-mono text-[0.7rem] leading-snug text-slate-900 sm:px-4 sm:py-3 sm:text-xs dark:text-slate-100">
                        {row.sku}
                      </td>
                      <td className="min-w-0 break-words px-2 py-2.5 align-top font-medium text-slate-900 sm:px-4 sm:py-3 dark:text-slate-100">
                        {row.itemLabel}
                      </td>
                      <td className="px-2 py-2.5 align-top capitalize text-slate-700 sm:px-4 sm:py-3 dark:text-slate-300">
                        {row.status}
                      </td>
                      <td className="min-w-0 px-2 py-2.5 align-top sm:px-4 sm:py-3">
                        <SubmittedAtCell iso={row.createdAt} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          </div>
        </section>
      )}

      {tab === 'create' && (
        <section
          id="panel-create"
          role="tabpanel"
          aria-labelledby="tab-create"
          className="min-h-[12rem]"
        />
      )}
    </div>
  )
}
