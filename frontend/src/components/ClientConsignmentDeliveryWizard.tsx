import { useCallback, useEffect, useMemo, useState } from 'react'
import { DatePickerField } from './DatePickerField'
import { HorizontalScrollMirror } from './HorizontalScrollMirror'
import { SubmittedAtCell } from './SubmittedAtCell'
import { useClientAuth } from '../context/client-auth'
import { useUnsavedChangesGuard } from '../context/unsaved-changes'
import { apiFetch } from '../lib/api'
import {
  branchLabel,
  CLIENT_DELIVERY_MODE_OPTIONS,
  DELIVERY_TIME_SLOT_OPTIONS,
  type BranchCode,
  type DeliveryTimeSlotCode,
} from '../lib/consignment-schedule-labels'
import { formatOfferTransactionLabel } from '../lib/format-offer-transaction-type'
import { formatPhpDisplay } from '../lib/format-php'

type ForDeliveryInquiryRow = {
  id: string
  sku: string
  itemLabel: string
  status: string
  createdAt: string
  offerTransactionType: 'consignment' | 'direct_purchase' | null
  offerPrice: string | null
}

const btnPrimary =
  'inline-flex items-center justify-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50'

const btnSecondary =
  'inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50'

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

function clientCanUsePickupService(
  vipStatus: string | null | undefined,
): boolean {
  const s = vipStatus?.trim()
  return s === 'Gold' || s === 'Diamond'
}

type Props = {
  preselectedInquiryId?: string | null
  onSaved?: () => void
  onCancel?: () => void
}

export function ClientConsignmentDeliveryWizard({
  preselectedInquiryId,
  onSaved,
  onCancel,
}: Props) {
  const { token, user } = useClientAuth()
  const [step, setStep] = useState<1 | 2>(1)
  const [inquiries, setInquiries] = useState<ForDeliveryInquiryRow[]>([])
  const [inquiryLoading, setInquiryLoading] = useState(false)
  const [inquiryError, setInquiryError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [preselectApplied, setPreselectApplied] = useState(false)

  const [deliveryDate, setDeliveryDate] = useState('')
  const [deliveryTimeSlot, setDeliveryTimeSlot] = useState<DeliveryTimeSlotCode>(
    DELIVERY_TIME_SLOT_OPTIONS[0].value,
  )
  const [mode, setMode] = useState('courier')
  const [branch, setBranch] = useState<BranchCode>('pasig')
  const [fullDates, setFullDates] = useState<string[]>([])
  const [availabilityLoading, setAvailabilityLoading] = useState(false)

  const [step1Error, setStep1Error] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)

  const deliveryDirty =
    step !== 1 ||
    selectedIds.length > 0 ||
    deliveryDate !== '' ||
    mode !== 'courier' ||
    branch !== 'pasig'

  useUnsavedChangesGuard({
    isDirty: deliveryDirty,
    bypass: saveLoading,
    description:
      'You have unsaved changes to this delivery schedule. Leave this page?',
  })

  const deliveryOptions = useMemo(() => {
    const allowPickup = clientCanUsePickupService(user?.client?.vipStatus)
    return CLIENT_DELIVERY_MODE_OPTIONS.filter(
      (o) => o.value !== 'pickup_service' || allowPickup,
    )
  }, [user?.client?.vipStatus])

  const loadInquiries = useCallback(async () => {
    setInquiryError(null)
    setInquiryLoading(true)
    try {
      const res = await apiFetch(
        '/api/client/consignment-schedules/for-delivery-inquiries',
        {},
        token,
      )
      if (!res.ok) throw new Error(await readApiErrorMessage(res))
      const data = (await res.json()) as ForDeliveryInquiryRow[]
      setInquiries(Array.isArray(data) ? data : [])
    } catch (e) {
      setInquiries([])
      setInquiryError(
        e instanceof Error ? e.message : 'Failed to load inquiries',
      )
    } finally {
      setInquiryLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadInquiries()
  }, [loadInquiries])

  useEffect(() => {
    if (preselectApplied || !preselectedInquiryId) return
    const id = preselectedInquiryId.trim()
    if (!id) return
    const match = inquiries.find((r) => r.id === id)
    if (match) {
      setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
      setPreselectApplied(true)
    }
  }, [preselectedInquiryId, inquiries, preselectApplied])

  const loadAvailability = useCallback(
    async (b: BranchCode, itemCount: number) => {
      if (!token) return
      setAvailabilityLoading(true)
      try {
        const res = await apiFetch(
          `/api/client/consignment-schedules/delivery-availability?branch=${encodeURIComponent(b)}&itemCount=${encodeURIComponent(String(Math.max(1, itemCount)))}`,
          {},
          token,
        )
        if (!res.ok) throw new Error(await readApiErrorMessage(res))
        const data = (await res.json()) as { fullDates?: string[] }
        setFullDates(Array.isArray(data.fullDates) ? data.fullDates : [])
      } catch {
        setFullDates([])
      } finally {
        setAvailabilityLoading(false)
      }
    },
    [token],
  )

  useEffect(() => {
    if (step !== 2) return
    void loadAvailability(branch, selectedIds.length)
  }, [step, branch, selectedIds.length, loadAvailability])

  useEffect(() => {
    if (
      mode === 'pickup_service' &&
      !clientCanUsePickupService(user?.client?.vipStatus)
    ) {
      setMode('courier')
    }
  }, [mode, user?.client?.vipStatus])

  useEffect(() => {
    if (deliveryDate && fullDates.includes(deliveryDate)) {
      setDeliveryDate('')
    }
  }, [deliveryDate, fullDates])

  const toggleId = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id]
      return prev.filter((x) => x !== id)
    })
  }, [])

  const allSelected =
    inquiries.length > 0 && inquiries.every((r) => selectedIds.includes(r.id))

  const toggleAll = useCallback(
    (checked: boolean) => {
      const ids = inquiries.map((r) => r.id)
      setSelectedIds((prev) => {
        if (!checked) return prev.filter((id) => !ids.includes(id))
        return [...new Set([...prev, ...ids])]
      })
    },
    [inquiries],
  )

  const goToStep2 = () => {
    setStep1Error(null)
    if (selectedIds.length === 0) {
      setStep1Error('Select at least one inquiry to continue.')
      return
    }
    setSaveError(null)
    setStep(2)
  }

  const saveSchedule = async () => {
    setSaveError(null)
    if (!deliveryDate.trim()) {
      setSaveError('Select a delivery date.')
      return
    }
    if (!deliveryTimeSlot) {
      setSaveError('Select a delivery time slot.')
      return
    }
    if (fullDates.includes(deliveryDate)) {
      setSaveError('The selected delivery date is not available for this branch.')
      return
    }
    setSaveLoading(true)
    try {
      const res = await apiFetch(
        '/api/client/consignment-schedules',
        {
          method: 'POST',
          body: JSON.stringify({
            inquiryIds: selectedIds,
            deliveryDate,
            deliveryTimeSlot,
            modeOfTransfer: mode,
            branch,
          }),
        },
        token,
      )
      if (!res.ok) throw new Error(await readApiErrorMessage(res))
      onSaved?.()
    } catch (e) {
      setSaveError(
        e instanceof Error ? e.message : 'Could not schedule delivery',
      )
    } finally {
      setSaveLoading(false)
    }
  }

  if (step === 1) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="mb-4 text-sm leading-relaxed text-slate-600">
          Select one or more items ready for delivery, then choose your delivery
          date and branch.
        </p>

        {inquiryError && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {inquiryError}
            <button
              type="button"
              className="ml-2 font-medium text-violet-700 underline"
              onClick={() => void loadInquiries()}
            >
              Retry
            </button>
          </p>
        )}

        {step1Error && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {step1Error}
          </p>
        )}

        <div className="max-w-full overflow-hidden rounded-xl border border-slate-200">
          <HorizontalScrollMirror>
            <table className="w-max min-w-full border-collapse text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th scope="col" className="px-3 py-2.5 sm:px-4">
                    <input
                      type="checkbox"
                      aria-label="Select all inquiries"
                      checked={allSelected}
                      disabled={inquiryLoading || inquiries.length === 0}
                      onChange={(e) => toggleAll(e.target.checked)}
                      className="size-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                  </th>
                  <th scope="col" className="px-3 py-2.5 sm:px-4">
                    SKU
                  </th>
                  <th scope="col" className="px-3 py-2.5 sm:px-4">
                    Item
                  </th>
                  <th scope="col" className="px-3 py-2.5 sm:px-4">
                    Offer
                  </th>
                  <th scope="col" className="px-3 py-2.5 sm:px-4">
                    Submitted
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {inquiryLoading && inquiries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      Loading…
                    </td>
                  </tr>
                )}
                {!inquiryLoading && inquiries.length === 0 && !inquiryError && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No items are ready for delivery scheduling.
                    </td>
                  </tr>
                )}
                {inquiries.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3 sm:px-4">
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.sku}`}
                        checked={selectedIds.includes(row.id)}
                        onChange={(e) => toggleId(row.id, e.target.checked)}
                        className="size-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                      />
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-900 sm:px-4">
                      {row.sku}
                    </td>
                    <td className="px-3 py-3 text-slate-800 sm:px-4">
                      {row.itemLabel}
                    </td>
                    <td className="px-3 py-3 text-slate-800 sm:px-4">
                      <span className="block text-xs text-slate-500">
                        {formatOfferTransactionLabel(row.offerTransactionType)}
                      </span>
                      {row.offerPrice ? (
                        <span className="font-medium">
                          {formatPhpDisplay(row.offerPrice)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-800 sm:px-4">
                      <SubmittedAtCell iso={row.createdAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </HorizontalScrollMirror>
        </div>

        <div className="mt-4 flex flex-wrap justify-between gap-2">
          {onCancel ? (
            <button
              type="button"
              className={btnSecondary}
              disabled={inquiryLoading}
              onClick={onCancel}
            >
              Cancel
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className={btnPrimary}
            disabled={inquiryLoading}
            onClick={goToStep2}
          >
            Next
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="mb-1 text-sm font-medium text-slate-900">
        {selectedIds.length} item{selectedIds.length === 1 ? '' : 's'} selected
      </p>
      <p className="mb-4 text-sm text-slate-600">
        Choose delivery date, mode, and branch.
      </p>

      <div className="space-y-4">
        <div>
          <label
            htmlFor="client-delivery-date"
            className="block text-sm font-medium text-slate-700"
          >
            Delivery date
          </label>
          <DatePickerField
            id="client-delivery-date"
            value={deliveryDate}
            onChange={setDeliveryDate}
            triggerClassName="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            placeholder="Select delivery date"
            dialogAriaLabel="Choose delivery date"
            disablePast
            disabledDateKeys={fullDates}
            disabled={saveLoading || availabilityLoading}
          />
          {availabilityLoading ? (
            <p className="mt-1 text-xs text-slate-500">Checking availability…</p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="client-delivery-time-slot"
            className="block text-sm font-medium text-slate-700"
          >
            Delivery time slot
          </label>
          <select
            id="client-delivery-time-slot"
            value={deliveryTimeSlot}
            onChange={(e) =>
              setDeliveryTimeSlot(e.target.value as DeliveryTimeSlotCode)
            }
            disabled={saveLoading}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          >
            {DELIVERY_TIME_SLOT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="client-delivery-mode"
            className="block text-sm font-medium text-slate-700"
          >
            Delivery option
          </label>
          <select
            id="client-delivery-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            disabled={saveLoading}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          >
            {deliveryOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="client-delivery-branch"
            className="block text-sm font-medium text-slate-700"
          >
            Branch
          </label>
          <select
            id="client-delivery-branch"
            value={branch}
            onChange={(e) => setBranch(e.target.value as BranchCode)}
            disabled={saveLoading}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          >
            <option value="pasig">{branchLabel('pasig')}</option>
            <option value="makati">{branchLabel('makati')}</option>
          </select>
        </div>
      </div>

      {saveError && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {saveError}
        </p>
      )}

      <div className="mt-6 flex flex-wrap justify-between gap-2">
        <button
          type="button"
          className={btnSecondary}
          disabled={saveLoading}
          onClick={() => {
            setSaveError(null)
            setStep(1)
          }}
        >
          Back
        </button>
        <button
          type="button"
          className={btnPrimary}
          disabled={saveLoading || !deliveryDate.trim() || !deliveryTimeSlot}
          onClick={() => void saveSchedule()}
        >
          {saveLoading ? 'Saving…' : 'Save schedule'}
        </button>
      </div>
    </section>
  )
}
