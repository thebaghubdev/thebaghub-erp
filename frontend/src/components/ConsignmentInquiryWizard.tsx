import { useCallback, useEffect, useRef, useState } from 'react'
import { ConsignItemForm } from './ConsignItemForm'
import { ConsignItemPhotoStep } from './ConsignItemPhotoStep'
import { TermsHtmlModal } from './TermsHtmlModal'
import {
  emptyConsignItemForm,
  MAX_ITEMS_PER_INQUIRY,
  type ConsignItemFormData,
  type DraftConsignItem,
  type LocalConsignImage,
} from '../types/consign-inquiry'

const btnPrimary =
  'w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50'
const btnSecondary =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50'
const btnGhost =
  'w-full rounded-xl border border-transparent px-4 py-2.5 text-sm font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline'
const btnDanger =
  'shrink-0 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50'

const CONSIGNMENT_TERMS_URL = '/terms/consignment.txt'

type Step = 1 | 2 | 3

function revokeAll(urls: LocalConsignImage[]) {
  for (const i of urls) URL.revokeObjectURL(i.previewUrl)
}

function cloneItem(it: DraftConsignItem): DraftConsignItem {
  return {
    id: it.id,
    form: { ...it.form },
    images: it.images.map((i) => ({ ...i })),
  }
}

function formatDate(iso: string) {
  if (!iso.trim()) return ''
  try {
    const d = new Date(iso + 'T12:00:00')
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

function ReviewChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 ${
        expanded ? 'rotate-180' : ''
      }`}
      aria-hidden
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  )
}

export function ConsignmentInquiryWizard() {
  const [step, setStep] = useState<Step>(1)
  const [draftForm, setDraftForm] = useState<ConsignItemFormData>(() =>
    emptyConsignItemForm(),
  )
  const [draftImages, setDraftImages] = useState<LocalConsignImage[]>([])
  const [items, setItems] = useState<DraftConsignItem[]>([])

  /** When editing, original row removed from list until save or cancel. */
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editInsertIndex, setEditInsertIndex] = useState<number | null>(null)
  const [editBackup, setEditBackup] = useState<DraftConsignItem | null>(null)

  /** Review accordion: omitted or true = expanded; false = collapsed. */
  const [reviewExpandedById, setReviewExpandedById] = useState<
    Record<string, boolean>
  >({})

  const [inquiryConsignmentTermsAccepted, setInquiryConsignmentTermsAccepted] =
    useState(false)
  const [consignmentTermsModalOpen, setConsignmentTermsModalOpen] =
    useState(false)

  const draftImagesRef = useRef<LocalConsignImage[]>([])
  const itemsRef = useRef<DraftConsignItem[]>([])
  useEffect(() => {
    draftImagesRef.current = draftImages
  }, [draftImages])
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    return () => {
      revokeAll(draftImagesRef.current)
      for (const it of itemsRef.current) revokeAll(it.images)
    }
  }, [])

  const clearDraft = useCallback((revoke: boolean) => {
    if (revoke) revokeAll(draftImages)
    setDraftForm(emptyConsignItemForm())
    setDraftImages([])
  }, [draftImages])

  const clearEditState = useCallback(() => {
    setEditingItemId(null)
    setEditInsertIndex(null)
    setEditBackup(null)
  }, [])

  /** Leave steps 1–2: restore item if mid-edit, revoke draft blobs, open review. */
  const abandonProgressAndGoToReview = useCallback(() => {
    if (editBackup != null && editInsertIndex != null) {
      setItems((prev) => {
        const next = [...prev]
        next.splice(editInsertIndex, 0, cloneItem(editBackup))
        return next
      })
    }
    clearDraft(true)
    clearEditState()
    setStep(3)
  }, [editBackup, editInsertIndex, clearDraft, clearEditState])

  const cancelEdit = abandonProgressAndGoToReview

  /** Review is available when at least one saved item exists, or an edit is in progress (restores on leave). */
  const canGoToReview = items.length >= 1 || editBackup != null

  const goToReview = useCallback(() => {
    if (!canGoToReview) return
    abandonProgressAndGoToReview()
  }, [canGoToReview, abandonProgressAndGoToReview])

  const deleteItem = useCallback((item: DraftConsignItem) => {
    if (
      !window.confirm('Remove this item from the inquiry? This cannot be undone.')
    ) {
      return
    }
    revokeAll(item.images)
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    setReviewExpandedById((prev) => {
      const { [item.id]: _, ...rest } = prev
      return rest
    })
  }, [])

  const beginEditItem = useCallback((item: DraftConsignItem, index: number) => {
    setEditBackup(cloneItem(item))
    setEditInsertIndex(index)
    setEditingItemId(item.id)
    setItems((prev) => prev.filter((_, i) => i !== index))
    setDraftForm({ ...item.form })
    // Fresh preview URLs for the draft so removing a photo here cannot revoke backups.
    setDraftImages(
      item.images.map((i) => ({
        id: crypto.randomUUID(),
        file: i.file,
        previewUrl: URL.createObjectURL(i.file),
      })),
    )
    setStep(1)
  }, [])

  const goAddAnother = useCallback(() => {
    if (items.length >= MAX_ITEMS_PER_INQUIRY) return
    clearEditState()
    clearDraft(true)
    setStep(1)
  }, [clearEditState, clearDraft, items.length])

  const handleStep1Continue = useCallback(() => {
    if (!editingItemId && items.length >= MAX_ITEMS_PER_INQUIRY) return
    setStep(2)
  }, [editingItemId, items.length])

  const handleStep2Back = useCallback(() => {
    setStep(1)
  }, [])

  const handleStep2Continue = useCallback(() => {
    if (!editingItemId && items.length >= MAX_ITEMS_PER_INQUIRY) return

    if (draftImages.length === 0) {
      window.alert(
        'Please add at least one photo for this item before continuing to review.',
      )
      return
    }

    const id = editingItemId ?? crypto.randomUUID()
    const newItem: DraftConsignItem = {
      id,
      form: { ...draftForm },
      images: draftImages.map((i) => ({ ...i })),
    }

    if (editBackup != null) {
      revokeAll(editBackup.images)
    }

    if (editingItemId != null && editInsertIndex != null) {
      setItems((prev) => {
        const next = [...prev]
        next.splice(editInsertIndex, 0, newItem)
        return next
      })
    } else {
      setItems((prev) => [...prev, newItem])
    }

    clearDraft(false)
    clearEditState()
    setStep(3)
  }, [
    draftForm,
    draftImages,
    editingItemId,
    editInsertIndex,
    editBackup,
    clearDraft,
    clearEditState,
    items.length,
    editingItemId,
  ])

  const onSubmitInquiry = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    // Submission logic will be added later.
  }, [])

  const isEditing = editingItemId != null
  const atItemLimit = items.length >= MAX_ITEMS_PER_INQUIRY
  const cannotAddNewItem = !isEditing && atItemLimit

  return (
    <div className="flex flex-col gap-5">
      <TermsHtmlModal
        open={consignmentTermsModalOpen}
        onClose={() => setConsignmentTermsModalOpen(false)}
        url={CONSIGNMENT_TERMS_URL}
        title="Consignment — terms and conditions"
      />
      <nav aria-label="Inquiry steps" className="flex gap-2 text-xs sm:text-sm">
        {([1, 2, 3] as const).map((n) => {
          const isCurrent = step === n
          const isDone = step > n
          const base =
            'flex flex-1 items-center justify-center rounded-lg border px-2 py-2 text-center font-medium transition-colors'
          const stateClass = isCurrent
            ? 'border-violet-500 bg-violet-50 text-violet-900'
            : isDone
              ? 'border-slate-200 bg-slate-50 text-slate-600'
              : 'border-slate-200 bg-white text-slate-400'
          const isReviewNav = n === 3
          if (isReviewNav && canGoToReview && !isCurrent) {
            return (
              <button
                key={n}
                type="button"
                onClick={goToReview}
                className={`${base} ${stateClass} cursor-pointer hover:border-violet-300 hover:bg-violet-50/80 hover:text-violet-800`}
              >
                3. Review
              </button>
            )
          }
          return (
            <div key={n} className={`${base} ${stateClass}`}>
              {n === 1 && '1. Details'}
              {n === 2 && '2. Photos'}
              {n === 3 && '3. Review'}
            </div>
          )
        })}
      </nav>

      {canGoToReview && step !== 3 && (
        <div className="-mt-1 flex justify-end">
          <button
            type="button"
            onClick={goToReview}
            className="text-sm font-medium text-violet-700 hover:text-violet-900 hover:underline"
          >
            Go to review
          </button>
        </div>
      )}

      {step === 1 && (
        <section aria-labelledby="step1-heading">
          <h2 id="step1-heading" className="sr-only">
            Item details
          </h2>
          {isEditing && (
            <p className="mb-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
              Editing an item — finish photos to save changes, or cancel to
              restore the previous version.
            </p>
          )}
          {cannotAddNewItem && (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              This inquiry already has the maximum of {MAX_ITEMS_PER_INQUIRY}{' '}
              items. Go to review or remove an item to continue.
            </p>
          )}
          <ConsignItemForm
            value={draftForm}
            onChange={setDraftForm}
            primaryDisabled={cannotAddNewItem}
            primaryAction={{
              label: 'Continue to photos',
              onClick: handleStep1Continue,
            }}
          />
          {isEditing && (
            <button type="button" className={`${btnGhost} mt-2`} onClick={cancelEdit}>
              Cancel editing
            </button>
          )}
        </section>
      )}

      {step === 2 && (
        <section aria-labelledby="step2-heading" className="flex flex-col gap-4">
          <h2
            id="step2-heading"
            className="text-base font-semibold text-slate-900"
          >
            Upload images
          </h2>
          {isEditing && (
            <button type="button" className={btnGhost} onClick={cancelEdit}>
              Cancel editing
            </button>
          )}
          <ConsignItemPhotoStep
            images={draftImages}
            onChange={setDraftImages}
          />
          {cannotAddNewItem && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Item limit reached. Use Back or go to review.
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row-reverse sm:gap-3">
            <button
              type="button"
              className={btnPrimary}
              onClick={handleStep2Continue}
              disabled={cannotAddNewItem}
            >
              Continue to review
            </button>
            <button type="button" className={btnSecondary} onClick={handleStep2Back}>
              Back
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section aria-labelledby="step3-heading" className="flex flex-col gap-4">
          <h2
            id="step3-heading"
            className="text-base font-semibold text-slate-900"
          >
            Review items
          </h2>
          {items.length > 0 && (
            <p className="text-xs text-slate-500">
              {items.length} of {MAX_ITEMS_PER_INQUIRY} items
              {atItemLimit ? ' (maximum reached)' : ''}
            </p>
          )}
          {items.length === 0 ? (
            <p className="text-sm text-slate-600">
              No items yet. Use the steps above to add an item.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((it, index) => {
                const expanded = reviewExpandedById[it.id] !== false
                const panelId = `review-item-panel-${it.id}`
                const headingId = `review-item-heading-${it.id}`
                return (
                  <li
                    key={it.id}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80"
                  >
                    <div className="flex flex-wrap items-stretch gap-2 p-3 sm:flex-nowrap sm:items-center sm:gap-3">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-start gap-2 rounded-xl px-1 py-0.5 text-left outline-none ring-violet-500 focus-visible:ring-2"
                        onClick={() =>
                          setReviewExpandedById((prev) => {
                            const open = prev[it.id] !== false
                            return { ...prev, [it.id]: !open }
                          })
                        }
                        aria-expanded={expanded}
                        aria-controls={panelId}
                        id={headingId}
                      >
                        <ReviewChevron expanded={expanded} />
                        <span className="min-w-0">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Item {index + 1}
                          </span>
                          <span className="mt-0.5 block truncate font-medium text-slate-900">
                            {it.form.itemModel}
                          </span>
                          <span className="block truncate text-sm text-slate-600">
                            {it.form.brand} · {it.form.category}
                          </span>
                        </span>
                      </button>
                      <div className="flex w-full shrink-0 flex-wrap justify-end gap-2 sm:w-auto">
                        <button
                          type="button"
                          className="shrink-0 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-900 hover:bg-violet-100"
                          onClick={() => beginEditItem(it, index)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={btnDanger}
                          onClick={() => deleteItem(it)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {expanded ? (
                      <div
                        id={panelId}
                        role="region"
                        aria-labelledby={headingId}
                        className="border-t border-slate-200/80 px-4 pb-4 pt-1"
                      >
                        <dl className="grid gap-2 text-sm text-slate-800">
                          <div>
                            <dt className="text-slate-500">Model</dt>
                            <dd className="font-medium">{it.form.itemModel}</dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">Brand</dt>
                            <dd>{it.form.brand}</dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">Category</dt>
                            <dd>{it.form.category}</dd>
                          </div>
                          {it.form.serialNumber ? (
                            <div>
                              <dt className="text-slate-500">Serial number</dt>
                              <dd>{it.form.serialNumber}</dd>
                            </div>
                          ) : null}
                          {it.form.color ? (
                            <div>
                              <dt className="text-slate-500">Color</dt>
                              <dd>{it.form.color}</dd>
                            </div>
                          ) : null}
                          {it.form.material ? (
                            <div>
                              <dt className="text-slate-500">Material</dt>
                              <dd>{it.form.material}</dd>
                            </div>
                          ) : null}
                          <div>
                            <dt className="text-slate-500">Condition</dt>
                            <dd>{it.form.condition}</dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">Inclusions</dt>
                            <dd className="whitespace-pre-wrap">
                              {it.form.inclusions}
                            </dd>
                          </div>
                          {it.form.datePurchased ? (
                            <div>
                              <dt className="text-slate-500">Date purchased</dt>
                              <dd>{formatDate(it.form.datePurchased)}</dd>
                            </div>
                          ) : null}
                          {it.form.sourceOfPurchase ? (
                            <div>
                              <dt className="text-slate-500">Source of purchase</dt>
                              <dd>{it.form.sourceOfPurchase}</dd>
                            </div>
                          ) : null}
                          {it.form.consignmentSellingPrice.trim() ? (
                            <div>
                              <dt className="text-slate-500">
                                Consignment selling price
                              </dt>
                              <dd>{it.form.consignmentSellingPrice}</dd>
                            </div>
                          ) : null}
                          {it.form.directPurchaseSellingPrice.trim() ? (
                            <div>
                              <dt className="text-slate-500">
                                Direct purchase selling price
                              </dt>
                              <dd>{it.form.directPurchaseSellingPrice}</dd>
                            </div>
                          ) : null}
                          {it.form.specialInstructions ? (
                            <div>
                              <dt className="text-slate-500">
                                Special instructions
                              </dt>
                              <dd className="whitespace-pre-wrap">
                                {it.form.specialInstructions}
                              </dd>
                            </div>
                          ) : null}
                          <div>
                            <dt className="text-slate-500">Consents</dt>
                            <dd className="text-sm">
                              Direct purchase &amp; terms:{' '}
                              {it.form.consentDirectPurchase ? 'Yes' : 'No'}
                              <br />
                              Price nomination (market research):{' '}
                              {it.form.consentPriceNomination ? 'Yes' : 'No'}
                            </dd>
                          </div>
                        </dl>
                        {it.images.length > 0 ? (
                          <ul className="mt-3 flex flex-wrap gap-2">
                            {it.images.map((img) => (
                              <li
                                key={img.id}
                                className="h-16 w-16 overflow-hidden rounded-lg border border-slate-200"
                              >
                                <img
                                  src={img.previewUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-xs text-slate-500">No photos</p>
                        )}
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}

          <div className="flex flex-col gap-1">
            <button
              type="button"
              className={btnSecondary}
              onClick={goAddAnother}
              disabled={atItemLimit}
              title={
                atItemLimit
                  ? `Maximum ${MAX_ITEMS_PER_INQUIRY} items per inquiry`
                  : undefined
              }
            >
              Add another item
            </button>
            {atItemLimit && (
              <p className="text-xs text-slate-500">
                You can add up to {MAX_ITEMS_PER_INQUIRY} items per inquiry.
                Remove an item to add a different one.
              </p>
            )}
          </div>

          <form onSubmit={onSubmitInquiry} className="flex flex-col gap-3 pt-2">
            <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-slate-800">
              <input
                type="checkbox"
                name="inquiryConsignmentTerms"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-violet-600 focus:ring-2 focus:ring-violet-500"
                checked={inquiryConsignmentTermsAccepted}
                onChange={(e) =>
                  setInquiryConsignmentTermsAccepted(e.target.checked)
                }
              />
              <span>
                I agree to The Bag Hub Consignment{' '}
                <button
                  type="button"
                  className="font-medium text-violet-700 underline decoration-violet-400 underline-offset-2 hover:text-violet-900"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setConsignmentTermsModalOpen(true)
                  }}
                >
                  Terms and Conditions
                </button>
                .
              </span>
            </label>
            <button
              type="submit"
              className={btnPrimary}
              disabled={!inquiryConsignmentTermsAccepted}
              title={
                !inquiryConsignmentTermsAccepted
                  ? 'Accept consignment terms to submit'
                  : undefined
              }
            >
              Submit inquiry
            </button>
            <p className="text-center text-xs text-slate-500">
              Submission is not processed yet — this button is a placeholder.
            </p>
          </form>
        </section>
      )}
    </div>
  )
}
