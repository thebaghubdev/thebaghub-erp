import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConsignmentInquiryWizard } from '../components/ConsignmentInquiryWizard'
import { SubmittedAtCell } from '../components/SubmittedAtCell'
import { useClientAuth } from '../context/client-auth'
import { apiFetch } from '../lib/api'

type ConsignmentsTab = 'mine' | 'consign'

type MyInquiryRow = {
  id: string
  itemLabel: string
  status: string
  createdAt: string
}

const tabBtn =
  '-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 sm:px-4'

function formatInquiryStatus(status: string) {
  const s = status.replace(/_/g, ' ').trim()
  if (!s) return status
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

const LEAVE_TAB_MSG =
  'You have unsaved changes to this consignment inquiry. Switch tabs anyway?'

export function ConsignItemsPage() {
  const navigate = useNavigate()
  const { token } = useClientAuth()
  const [tab, setTab] = useState<ConsignmentsTab>('mine')
  const [wizardDirty, setWizardDirty] = useState(false)
  const [rows, setRows] = useState<MyInquiryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadMyInquiries = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await apiFetch('/api/client/consignment-inquiry', {}, token)
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const data = (await res.json()) as MyInquiryRow[]
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Failed to load your inquiries',
      )
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (tab === 'mine') void loadMyInquiries()
  }, [tab, loadMyInquiries])

  const requestTab = (next: ConsignmentsTab) => {
    if (tab === 'consign' && next === 'mine' && wizardDirty) {
      if (!window.confirm(LEAVE_TAB_MSG)) return
    }
    setTab(next)
  }

  return (
    <div className="w-full min-w-0">
      <div
        className="mb-4 flex items-end gap-1 border-b border-slate-200 sm:gap-2"
        role="tablist"
        aria-label="Consignments sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'mine'}
          id="tab-consignments-mine"
          aria-controls="panel-consignments-mine"
          className={`${tabBtn} ${
            tab === 'mine'
              ? 'border-violet-600 text-violet-700'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          onClick={() => requestTab('mine')}
        >
          My consignments
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'consign'}
          id="tab-consignments-items"
          aria-controls="panel-consignments-items"
          className={`${tabBtn} ${
            tab === 'consign'
              ? 'border-violet-600 text-violet-700'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          onClick={() => requestTab('consign')}
        >
          Consign items
        </button>
      </div>

      {tab === 'mine' && (
        <section
          id="panel-consignments-mine"
          role="tabpanel"
          aria-labelledby="tab-consignments-mine"
        >
          {error && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
              <button
                type="button"
                className="ml-2 font-medium text-violet-700 underline"
                onClick={() => void loadMyInquiries()}
              >
                Retry
              </button>
            </p>
          )}

          <div className="max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full table-fixed border-collapse text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <tr>
                    <th
                      scope="col"
                      className="min-w-0 w-[46%] px-2 py-2.5 sm:w-[50%] sm:px-4 sm:py-3"
                    >
                      Item
                    </th>
                    <th
                      scope="col"
                      className="w-[26%] px-2 py-2.5 sm:px-4 sm:py-3"
                    >
                      Status
                    </th>
                    <th
                      scope="col"
                      className="min-w-0 w-[28%] px-2 py-2.5 sm:w-[24%] sm:px-4 sm:py-3"
                    >
                      Submitted
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
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
                        No inquiries yet. Use &quot;Consign items&quot; to submit
                        one.
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      role="link"
                      tabIndex={0}
                      aria-label={`View inquiry ${row.itemLabel}`}
                      className="cursor-pointer hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                      onClick={() => navigate(`/consignments/${row.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          navigate(`/consignments/${row.id}`)
                        }
                      }}
                    >
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {row.itemLabel}
                      </td>
                      <td className="px-4 py-3 capitalize text-slate-700">
                        {formatInquiryStatus(row.status)}
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

      {tab === 'consign' && (
        <section
          id="panel-consignments-items"
          role="tabpanel"
          aria-labelledby="tab-consignments-items"
        >
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-4 text-sm leading-relaxed text-slate-600">
              Start a consignment inquiry: enter details, add photos, then review
              before submitting.
            </p>
            <ConsignmentInquiryWizard
              onDirtyChange={setWizardDirty}
              onSubmitted={() => {
                setTab('mine')
              }}
            />
          </div>
        </section>
      )}
    </div>
  )
}
