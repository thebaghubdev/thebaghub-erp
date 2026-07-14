import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ConsignmentInquiryWizard,
  type ConsignmentInquiryWizardHandle,
} from '../components/ConsignmentInquiryWizard'
import { ClientConsignmentDeliveryWizard } from '../components/ClientConsignmentDeliveryWizard'
import { ClientMySchedulesPanel } from '../components/ClientMySchedulesPanel'
import { UnsavedConsignmentDraftDialog } from '../components/UnsavedConsignmentDraftDialog'
import { SubmittedAtCell } from '../components/SubmittedAtCell'
import { HorizontalScrollMirror } from '../components/HorizontalScrollMirror'
import { TablePaginationBar } from '../components/TablePaginationBar'
import { useClientAuth } from '../context/client-auth'
import { apiFetch } from '../lib/api'
import { useClientPagination } from '../hooks/useClientPagination'
import { InquiryStatusBadge } from '../components/InquiryStatusBadge'

type ConsignmentsTab = 'mine' | 'consign' | 'schedules'

type MyInquiryRow = {
  id: string
  itemLabel: string
  status: string
  createdAt: string
}

const tabBtn =
  '-mb-px shrink-0 border-b-2 border-transparent px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 sm:px-4'

function parseTabParam(raw: string | null): ConsignmentsTab | null {
  if (raw === 'delivery') return 'schedules'
  if (raw === 'mine' || raw === 'consign' || raw === 'schedules') {
    return raw
  }
  return null
}

export function ConsignItemsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { token } = useClientAuth()
  const wizardRef = useRef<ConsignmentInquiryWizardHandle>(null)
  const [tab, setTab] = useState<ConsignmentsTab>('mine')
  const [scheduleWizardOpen, setScheduleWizardOpen] = useState(false)
  const [wizardDirty, setWizardDirty] = useState(false)
  const [tabLeaveOpen, setTabLeaveOpen] = useState(false)
  const [pendingTab, setPendingTab] = useState<ConsignmentsTab | null>(null)
  const [tabLeaveSaving, setTabLeaveSaving] = useState(false)
  const [rows, setRows] = useState<MyInquiryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [schedulesRefreshKey, setSchedulesRefreshKey] = useState(0)
  const preselectedInquiryId = searchParams.get('select')

  const minePagination = useClientPagination(rows)

  useEffect(() => {
    const tabParam = searchParams.get('tab')
    const fromUrl = parseTabParam(tabParam)
    if (fromUrl) setTab(fromUrl)

    const wantsWizard =
      tabParam === 'delivery' || searchParams.get('create') === '1'
    setScheduleWizardOpen(wantsWizard)
  }, [searchParams])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const syncSchedulesUrl = useCallback(
    (options?: { create?: boolean; keepSelect?: boolean }) => {
      const params = new URLSearchParams(searchParams)
      params.set('tab', 'schedules')
      if (options?.create) {
        params.set('create', '1')
      } else {
        params.delete('create')
      }
      if (!options?.keepSelect) params.delete('select')
      setSearchParams(params, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const syncTabToUrl = useCallback(
    (next: ConsignmentsTab) => {
      const params = new URLSearchParams(searchParams)
      params.set('tab', next)
      params.delete('create')
      params.delete('select')
      setSearchParams(params, { replace: true })
    },
    [searchParams, setSearchParams],
  )

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
    if (tab === 'consign' && next !== 'consign' && wizardDirty) {
      setPendingTab(next)
      setTabLeaveOpen(true)
      return
    }
    setScheduleWizardOpen(false)
    setTab(next)
    syncTabToUrl(next)
  }

  const openScheduleWizard = useCallback(() => {
    setScheduleWizardOpen(true)
    syncSchedulesUrl({ create: true, keepSelect: Boolean(preselectedInquiryId) })
  }, [syncSchedulesUrl, preselectedInquiryId])

  const closeScheduleWizard = useCallback(() => {
    setScheduleWizardOpen(false)
    syncSchedulesUrl()
  }, [syncSchedulesUrl])

  const closeTabLeave = useCallback(() => {
    setTabLeaveOpen(false)
    setPendingTab(null)
  }, [])

  const confirmTabLeaveWithoutSaving = useCallback(() => {
    if (pendingTab != null) {
      setTab(pendingTab)
      syncTabToUrl(pendingTab)
      if (pendingTab !== 'schedules') setScheduleWizardOpen(false)
    }
    closeTabLeave()
  }, [pendingTab, closeTabLeave, syncTabToUrl])

  const confirmTabLeaveWithSave = useCallback(async () => {
    setTabLeaveSaving(true)
    try {
      const ok = await wizardRef.current?.saveDraftToServer()
      if (ok && pendingTab != null) {
        setTab(pendingTab)
        syncTabToUrl(pendingTab)
        if (pendingTab !== 'schedules') setScheduleWizardOpen(false)
        closeTabLeave()
      }
    } finally {
      setTabLeaveSaving(false)
    }
  }, [pendingTab, closeTabLeave, syncTabToUrl])

  const handleDeliverySaved = useCallback(() => {
    setSchedulesRefreshKey((k) => k + 1)
    setToast('Delivery scheduled successfully.')
    setScheduleWizardOpen(false)
    syncSchedulesUrl()
  }, [syncSchedulesUrl])

  return (
    <div className="w-full min-w-0">
      {toast ? (
        <div
          role="status"
          className="fixed bottom-20 left-1/2 z-50 max-w-sm -translate-x-1/2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 shadow-lg sm:bottom-6"
        >
          {toast}
        </div>
      ) : null}

      <UnsavedConsignmentDraftDialog
        open={tabLeaveOpen}
        saveBusy={tabLeaveSaving}
        onStay={closeTabLeave}
        onLeaveWithoutSaving={confirmTabLeaveWithoutSaving}
        onSave={confirmTabLeaveWithSave}
      />
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
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'schedules'}
          id="tab-consignments-schedules"
          aria-controls="panel-consignments-schedules"
          className={`${tabBtn} ${
            tab === 'schedules'
              ? 'border-violet-600 text-violet-700'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          onClick={() => requestTab('schedules')}
        >
          Schedules
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
            <div className="border-b border-slate-200 bg-slate-50/80 px-3 py-3 sm:px-4">
              <TablePaginationBar
                totalCount={minePagination.totalCount}
                pageIndex={minePagination.pageIndex}
                pageSize={minePagination.pageSize}
                onPageIndexChange={minePagination.setPageIndex}
                onPageSizeChange={minePagination.setPageSize}
                disabled={loading && rows.length === 0}
                itemLabel="inquiries"
              />
            </div>
            <HorizontalScrollMirror>
            <table className="w-max min-w-full border-collapse text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <tr>
                    <th
                      scope="col"
                      className="max-w-[10rem] min-w-0 px-2 py-2.5 sm:px-4 sm:py-3"
                    >
                      Item
                    </th>
                    <th
                      scope="col"
                      className="max-w-[10rem] min-w-0 px-2 py-2.5 sm:px-4 sm:py-3"
                    >
                      Status
                    </th>
                    <th
                      scope="col"
                      className="max-w-[10rem] min-w-0 px-2 py-2.5 sm:px-4 sm:py-3"
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
                  {minePagination.pageItems.map((row) => (
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
                      <td className="max-w-[10rem] min-w-0 break-words px-4 py-3 font-medium text-slate-900">
                        {row.itemLabel}
                      </td>
                      <td className="max-w-[10rem] min-w-0 px-4 py-3">
                        <InquiryStatusBadge status={row.status} />
                      </td>
                      <td className="max-w-[10rem] min-w-0 px-2 py-2.5 align-top sm:px-4 sm:py-3">
                        <SubmittedAtCell iso={row.createdAt} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </HorizontalScrollMirror>
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
              ref={wizardRef}
              onDirtyChange={setWizardDirty}
              onSubmitted={() => {
                setTab('mine')
                syncTabToUrl('mine')
              }}
            />
          </div>
        </section>
      )}

      {tab === 'schedules' && (
        <section
          id="panel-consignments-schedules"
          role="tabpanel"
          aria-labelledby="tab-consignments-schedules"
        >
          {scheduleWizardOpen ? (
            <ClientConsignmentDeliveryWizard
              preselectedInquiryId={preselectedInquiryId}
              onSaved={handleDeliverySaved}
              onCancel={closeScheduleWizard}
            />
          ) : (
            <ClientMySchedulesPanel
              refreshKey={schedulesRefreshKey}
              onCreateSchedule={openScheduleWizard}
            />
          )}
        </section>
      )}
    </div>
  )
}
