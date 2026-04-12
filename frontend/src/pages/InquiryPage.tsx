import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/useAuth'
import { apiFetch } from '../lib/api'

type InquiryRow = {
  id: string
  subject: string
  status: string
  createdAt: string
}

type InquiryTab = 'all' | 'create'

export function InquiryPage() {
  const { token } = useAuth()
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
      <h2 className="mb-6 text-lg font-semibold tracking-tight">Inquiry</h2>
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

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Subject
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {loading && rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-8 text-center text-slate-500"
                      >
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!loading && rows.length === 0 && !error && (
                    <tr>
                      <td
                        colSpan={3}
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
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {row.subject}
                      </td>
                      <td className="px-4 py-3 capitalize text-slate-700 dark:text-slate-300">
                        {row.status}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-400">
                        {new Date(row.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
