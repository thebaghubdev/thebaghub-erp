import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, type BlockerFunction } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { randomId } from "../lib/random-id";
import { formatPhpDisplay } from "../lib/format-php";
import { StaffWalkInConsignmentItemForm } from "./StaffWalkInConsignmentItemForm";
import { ConsignItemPhotoStep } from "./ConsignItemPhotoStep";
import { ConfirmDialog } from "./ConfirmDialog";
import { NoticeDialog } from "./NoticeDialog";
import {
  emptyConsignItemForm,
  MAX_ITEMS_PER_INQUIRY,
  type ConsignItemFormData,
  type DraftConsignItem,
  type LocalConsignImage,
} from "../types/consign-inquiry";

const btnPrimary =
  "rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50";
const btnSecondary =
  "rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800";
const btnGhost =
  "rounded-xl border border-transparent px-4 py-2.5 text-sm font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-slate-100";
const btnDanger =
  "shrink-0 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200";

const WALK_IN_RECEIVING_BRANCHES = ["Pasig", "Makati"] as const;
type WalkInReceivingBranch = (typeof WALK_IN_RECEIVING_BRANCHES)[number];

const reviewBranchLabel =
  "mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300";
const reviewBranchSelect =
  "w-full max-w-sm rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

type Step = 1 | 2 | 3;

function revokeAll(urls: LocalConsignImage[]) {
  for (const i of urls) URL.revokeObjectURL(i.previewUrl);
}

function cloneItem(it: DraftConsignItem): DraftConsignItem {
  return {
    id: it.id,
    form: { ...it.form },
    images: it.images.map((i) => ({ ...i })),
  };
}

/** Walk-in flow records both consents as agreed (no checkboxes). */
function staffWalkInEmptyConsignItemForm(): ConsignItemFormData {
  return {
    ...emptyConsignItemForm(),
    consentDirectPurchase: true,
    consentPriceNomination: true,
  };
}

function isStaffWalkInFormPristine(form: ConsignItemFormData): boolean {
  const empty = staffWalkInEmptyConsignItemForm();
  return (Object.keys(empty) as (keyof ConsignItemFormData)[]).every(
    (k) => form[k] === empty[k],
  );
}

function formatDate(iso: string) {
  if (!iso.trim()) return "";
  try {
    const d = new Date(iso + "T12:00:00");
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function ReviewChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 ${
        expanded ? "rotate-180" : ""
      }`}
      aria-hidden
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 8.25l-7.5 7.5-7.5-7.5"
      />
    </svg>
  );
}

type StaffWalkInConsignmentWizardProps = {
  portalToken: string | null;
  /** Client profile id (`clients.id`) for the selected consignor. */
  consignorClientId: string;
  onSubmitted?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
};

export function StaffWalkInConsignmentWizard({
  portalToken,
  consignorClientId,
  onSubmitted,
  onDirtyChange,
}: StaffWalkInConsignmentWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [draftForm, setDraftForm] = useState<ConsignItemFormData>(() =>
    staffWalkInEmptyConsignItemForm(),
  );
  const [draftImages, setDraftImages] = useState<LocalConsignImage[]>([]);
  const [items, setItems] = useState<DraftConsignItem[]>([]);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editInsertIndex, setEditInsertIndex] = useState<number | null>(null);
  const [editBackup, setEditBackup] = useState<DraftConsignItem | null>(null);

  const [reviewExpandedById, setReviewExpandedById] = useState<
    Record<string, boolean>
  >({});

  const [notice, setNotice] = useState<{
    open: boolean;
    title: string;
    message: string;
  }>({ open: false, title: "Notice", message: "" });

  const [pendingDeleteItem, setPendingDeleteItem] =
    useState<DraftConsignItem | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [walkInBranch, setWalkInBranch] = useState<
    "" | WalkInReceivingBranch
  >("");

  const draftImagesRef = useRef<LocalConsignImage[]>([]);
  const itemsRef = useRef<DraftConsignItem[]>([]);
  useEffect(() => {
    draftImagesRef.current = draftImages;
  }, [draftImages]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      revokeAll(draftImagesRef.current);
      for (const it of itemsRef.current) revokeAll(it.images);
    };
  }, []);

  const isWizardDirty = useMemo(() => {
    if (items.length > 0) return true;
    if (!isStaffWalkInFormPristine(draftForm)) return true;
    if (draftImages.length > 0) return true;
    if (step !== 1) return true;
    if (editingItemId != null || editBackup != null) return true;
    return false;
  }, [
    items.length,
    draftForm,
    draftImages.length,
    step,
    editingItemId,
    editBackup,
  ]);

  useEffect(() => {
    onDirtyChange?.(isWizardDirty);
  }, [isWizardDirty, onDirtyChange]);

  useEffect(() => {
    return () => {
      onDirtyChange?.(false);
    };
  }, [onDirtyChange]);

  useEffect(() => {
    if (!isWizardDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isWizardDirty]);

  const shouldBlockRouterNavigation = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      isWizardDirty &&
      !submitting &&
      currentLocation.pathname !== nextLocation.pathname,
    [isWizardDirty, submitting],
  );

  const blocker = useBlocker(shouldBlockRouterNavigation);

  const clearDraft = useCallback(
    (revoke: boolean) => {
      if (revoke) revokeAll(draftImages);
      setDraftForm(staffWalkInEmptyConsignItemForm());
      setDraftImages([]);
    },
    [draftImages],
  );

  const clearEditState = useCallback(() => {
    setEditingItemId(null);
    setEditInsertIndex(null);
    setEditBackup(null);
  }, []);

  const abandonProgressAndGoToReview = useCallback(() => {
    if (editBackup != null && editInsertIndex != null) {
      setItems((prev) => {
        const next = [...prev];
        next.splice(editInsertIndex, 0, cloneItem(editBackup));
        return next;
      });
    }
    clearDraft(true);
    clearEditState();
    setStep(3);
  }, [editBackup, editInsertIndex, clearDraft, clearEditState]);

  const cancelEdit = abandonProgressAndGoToReview;

  const canGoToReview = items.length >= 1 || editBackup != null;

  const goToReview = useCallback(() => {
    if (!canGoToReview) return;
    abandonProgressAndGoToReview();
  }, [canGoToReview, abandonProgressAndGoToReview]);

  const deleteItem = useCallback((item: DraftConsignItem) => {
    setPendingDeleteItem(item);
  }, []);

  const confirmDeleteItem = useCallback(() => {
    const item = pendingDeleteItem;
    if (!item) return;
    revokeAll(item.images);
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== item.id);
      if (next.length === 0) {
        setWalkInBranch("");
      }
      return next;
    });
    setReviewExpandedById((prev) => {
      const { [item.id]: _, ...rest } = prev;
      return rest;
    });
    setPendingDeleteItem(null);
  }, [pendingDeleteItem]);

  const beginEditItem = useCallback((item: DraftConsignItem, index: number) => {
    setEditBackup(cloneItem(item));
    setEditInsertIndex(index);
    setEditingItemId(item.id);
    setItems((prev) => prev.filter((_, i) => i !== index));
    setDraftForm({
      ...item.form,
      consentDirectPurchase: true,
      consentPriceNomination: true,
    });
    setDraftImages(
      item.images.map((i) => ({
        id: randomId(),
        file: i.file,
        previewUrl: URL.createObjectURL(i.file),
      })),
    );
    setStep(1);
  }, []);

  const goAddAnother = useCallback(() => {
    if (items.length >= MAX_ITEMS_PER_INQUIRY) return;
    clearEditState();
    clearDraft(true);
    setStep(1);
  }, [clearEditState, clearDraft, items.length]);

  const handleStep1Continue = useCallback(() => {
    if (!editingItemId && items.length >= MAX_ITEMS_PER_INQUIRY) return;
    setStep(2);
  }, [editingItemId, items.length]);

  const handleStep2Back = useCallback(() => {
    setStep(1);
  }, []);

  const handleStep2Continue = useCallback(() => {
    if (!editingItemId && items.length >= MAX_ITEMS_PER_INQUIRY) return;

    if (draftImages.length === 0) {
      setNotice({
        open: true,
        title: "Photos required",
        message:
          "Please add at least one photo for this item before continuing to review.",
      });
      return;
    }

    const id = editingItemId ?? randomId();
    const newItem: DraftConsignItem = {
      id,
      form: {
        ...draftForm,
        consentDirectPurchase: true,
        consentPriceNomination: true,
      },
      images: draftImages.map((i) => ({ ...i })),
    };

    if (editBackup != null) {
      revokeAll(editBackup.images);
    }

    if (editingItemId != null && editInsertIndex != null) {
      setItems((prev) => {
        const next = [...prev];
        next.splice(editInsertIndex, 0, newItem);
        return next;
      });
    } else {
      setItems((prev) => [...prev, newItem]);
    }

    clearDraft(false);
    clearEditState();
    setStep(3);
  }, [
    draftForm,
    draftImages,
    editingItemId,
    editInsertIndex,
    editBackup,
    clearDraft,
    clearEditState,
    items.length,
  ]);

  const onSubmitWalkIn = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!portalToken) {
        setSubmitError("You must be signed in to save inquiries.");
        return;
      }
      if (items.length === 0) {
        setSubmitError("Add at least one item before saving.");
        return;
      }
      if (!walkInBranch) {
        setSubmitError("Select a receiving branch before saving.");
        return;
      }

      setSubmitError(null);
      setSubmitting(true);
      try {
        const payload = {
          consignorClientId,
          walkInBranch,
          items: items.map((item) => ({
            clientItemId: item.id,
            form: item.form,
            imageCount: item.images.length,
          })),
        };
        const fd = new FormData();
        fd.append("payload", JSON.stringify(payload));
        for (const item of items) {
          for (const img of item.images) {
            fd.append("file", img.file);
          }
        }
        const res = await apiFetch(
          "/api/inquiries/walk-in",
          { method: "POST", body: fd },
          portalToken,
        );
        const raw = await res.text();
        if (!res.ok) {
          let msg = `Request failed (${res.status})`;
          try {
            const j = JSON.parse(raw) as {
              message?: string | string[];
            };
            if (typeof j.message === "string") msg = j.message;
            else if (Array.isArray(j.message))
              msg = j.message.map((m) => String(m)).join(", ");
          } catch {
            if (raw) msg = raw;
          }
          throw new Error(msg);
        }

        let submittedCount = 1;
        try {
          const data = JSON.parse(raw) as {
            inquiries?: { id: string; status: string }[];
          };
          submittedCount = data.inquiries?.length ?? 1;
        } catch {
          /* ignore */
        }

        for (const it of items) revokeAll(it.images);
        setItems([]);
        setWalkInBranch("");
        setReviewExpandedById({});
        setStep(1);
        setSubmitError(null);
        onSubmitted?.();
        setNotice({
          open: true,
          title: "Saved",
          message:
            submittedCount === 1
              ? "1 inquiry saved."
              : `${submittedCount} inquiries saved.`,
        });
      } catch (err) {
        setSubmitError(
          err instanceof Error ? err.message : "Saving failed.",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [portalToken, consignorClientId, items, walkInBranch, onSubmitted],
  );

  const isEditing = editingItemId != null;
  const atItemLimit = items.length >= MAX_ITEMS_PER_INQUIRY;
  const cannotAddNewItem = !isEditing && atItemLimit;

  return (
    <div className="flex flex-col gap-5">
      <NoticeDialog
        open={notice.open}
        title={notice.title}
        message={notice.message}
        onClose={() => setNotice((n) => ({ ...n, open: false }))}
      />
      <ConfirmDialog
        open={blocker.state === "blocked"}
        title="Leave this page?"
        description="You have unsaved changes to this consignment inquiry. Leave this page?"
        cancelLabel="Stay"
        confirmLabel="Leave"
        onCancel={() => blocker.reset()}
        onConfirm={() => blocker.proceed()}
      />
      <ConfirmDialog
        open={pendingDeleteItem !== null}
        title="Remove item"
        description="Remove this item from the inquiry? This cannot be undone."
        cancelLabel="Cancel"
        confirmLabel="Remove"
        danger
        onCancel={() => setPendingDeleteItem(null)}
        onConfirm={confirmDeleteItem}
      />

      <nav aria-label="Inquiry steps" className="flex gap-2 text-xs sm:text-sm">
        {([1, 2, 3] as const).map((n) => {
          const isCurrent = step === n;
          const isDone = step > n;
          const base =
            "flex flex-1 items-center justify-center rounded-lg border px-2 py-2 text-center font-medium transition-colors";
          const stateClass = isCurrent
            ? "border-violet-500 bg-violet-50 text-violet-900 dark:border-violet-500 dark:bg-violet-950/50 dark:text-violet-200"
            : isDone
              ? "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300"
              : "border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500";
          const isReviewNav = n === 3;
          if (isReviewNav && canGoToReview && !isCurrent) {
            return (
              <button
                key={n}
                type="button"
                onClick={goToReview}
                className={`${base} ${stateClass} cursor-pointer hover:border-violet-300 hover:bg-violet-50/80 hover:text-violet-800 dark:hover:border-violet-600 dark:hover:bg-violet-950/40 dark:hover:text-violet-200`}
              >
                3. Review
              </button>
            );
          }
          return (
            <div key={n} className={`${base} ${stateClass}`}>
              {n === 1 && "1. Details"}
              {n === 2 && "2. Photos"}
              {n === 3 && "3. Review"}
            </div>
          );
        })}
      </nav>

      {canGoToReview && step !== 3 && (
        <div className="-mt-1 flex justify-end">
          <button
            type="button"
            onClick={goToReview}
            className="text-sm font-medium text-violet-700 hover:text-violet-900 hover:underline dark:text-violet-300 dark:hover:text-violet-100"
          >
            Go to review
          </button>
        </div>
      )}

      {step === 1 && (
        <section aria-labelledby="staff-step1-heading">
          <h2 id="staff-step1-heading" className="sr-only">
            Item details
          </h2>
          {isEditing && (
            <p className="mb-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
              Editing an item — finish photos to save changes, or cancel to
              restore the previous version.
            </p>
          )}
          {cannotAddNewItem && (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              This inquiry already has the maximum of {MAX_ITEMS_PER_INQUIRY}{" "}
              items. Go to review or remove an item to continue.
            </p>
          )}
          <StaffWalkInConsignmentItemForm
            value={draftForm}
            onChange={setDraftForm}
            portalToken={portalToken}
            primaryDisabled={cannotAddNewItem}
            primaryAction={{
              label: "Continue to photos",
              onClick: handleStep1Continue,
            }}
          />
          {isEditing && (
            <button
              type="button"
              className={`${btnGhost} mt-2 w-full sm:w-auto`}
              onClick={cancelEdit}
            >
              Cancel editing
            </button>
          )}
        </section>
      )}

      {step === 2 && (
        <section
          aria-labelledby="staff-step2-heading"
          className="flex flex-col gap-4"
        >
          <h2
            id="staff-step2-heading"
            className="text-base font-semibold text-slate-900 dark:text-slate-100"
          >
            Upload images
          </h2>
          {isEditing && (
            <button
              type="button"
              className={`${btnGhost} self-start`}
              onClick={cancelEdit}
            >
              Cancel editing
            </button>
          )}
          <ConsignItemPhotoStep
            images={draftImages}
            onChange={setDraftImages}
          />
          {cannotAddNewItem && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Item limit reached. Use Back or go to review.
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row-reverse sm:gap-3">
            <button
              type="button"
              className={`${btnPrimary} w-full sm:w-auto sm:min-w-[12rem]`}
              onClick={handleStep2Continue}
              disabled={cannotAddNewItem}
            >
              Continue to review
            </button>
            <button
              type="button"
              className={`${btnSecondary} w-full sm:w-auto sm:min-w-[12rem]`}
              onClick={handleStep2Back}
            >
              Back
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section
          aria-labelledby="staff-step3-heading"
          className="flex flex-col gap-4"
        >
          <h2
            id="staff-step3-heading"
            className="text-base font-semibold text-slate-900 dark:text-slate-100"
          >
            Review items
          </h2>
          {items.length > 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {items.length} of {MAX_ITEMS_PER_INQUIRY} items
              {atItemLimit ? " (maximum reached)" : ""}
            </p>
          )}
          {items.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-slate-900/40">
              <label
                htmlFor="staff-walkin-receiving-branch"
                className={reviewBranchLabel}
              >
                Receiving branch
              </label>
              <select
                id="staff-walkin-receiving-branch"
                className={reviewBranchSelect}
                value={walkInBranch}
                onChange={(e) =>
                  setWalkInBranch(
                    e.target.value as "" | WalkInReceivingBranch,
                  )
                }
                aria-invalid={items.length > 0 && !walkInBranch}
                required
              >
                <option value="">Select branch…</option>
                {WALK_IN_RECEIVING_BRANCHES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {items.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              No items yet. Use the steps above to add an item.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((it, index) => {
                const expanded = reviewExpandedById[it.id] !== false;
                const panelId = `staff-review-item-panel-${it.id}`;
                const headingId = `staff-review-item-heading-${it.id}`;
                return (
                  <li
                    key={it.id}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/50"
                  >
                    <div className="flex flex-wrap items-stretch gap-2 p-3 sm:flex-nowrap sm:items-center sm:gap-3">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-start gap-2 rounded-xl px-1 py-0.5 text-left outline-none ring-violet-500 focus-visible:ring-2"
                        onClick={() =>
                          setReviewExpandedById((prev) => {
                            const open = prev[it.id] !== false;
                            return { ...prev, [it.id]: !open };
                          })
                        }
                        aria-expanded={expanded}
                        aria-controls={panelId}
                        id={headingId}
                      >
                        <ReviewChevron expanded={expanded} />
                        <span className="min-w-0">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Item {index + 1}
                          </span>
                          <span className="mt-0.5 block truncate font-medium text-slate-900 dark:text-slate-100">
                            {it.form.itemModel}
                          </span>
                          <span className="block truncate text-sm text-slate-600 dark:text-slate-300">
                            {it.form.brand} · {it.form.category}
                          </span>
                        </span>
                      </button>
                      <div className="flex w-full shrink-0 flex-wrap justify-end gap-2 sm:w-auto">
                        <button
                          type="button"
                          className="shrink-0 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-900 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-200 dark:hover:bg-violet-900/50"
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
                        className="border-t border-slate-200/80 px-4 pb-4 pt-1 dark:border-slate-700"
                      >
                        <dl className="grid gap-2 text-sm text-slate-800 dark:text-slate-200">
                          <div>
                            <dt className="text-slate-500 dark:text-slate-400">
                              Model
                            </dt>
                            <dd className="font-medium">{it.form.itemModel}</dd>
                          </div>
                          <div>
                            <dt className="text-slate-500 dark:text-slate-400">
                              Brand
                            </dt>
                            <dd>{it.form.brand}</dd>
                          </div>
                          <div>
                            <dt className="text-slate-500 dark:text-slate-400">
                              Category
                            </dt>
                            <dd>{it.form.category}</dd>
                          </div>
                          {it.form.serialNumber ? (
                            <div>
                              <dt className="text-slate-500 dark:text-slate-400">
                                Serial number
                              </dt>
                              <dd>{it.form.serialNumber}</dd>
                            </div>
                          ) : null}
                          {it.form.color ? (
                            <div>
                              <dt className="text-slate-500 dark:text-slate-400">
                                Color
                              </dt>
                              <dd>{it.form.color}</dd>
                            </div>
                          ) : null}
                          {it.form.material ? (
                            <div>
                              <dt className="text-slate-500 dark:text-slate-400">
                                Material
                              </dt>
                              <dd>{it.form.material}</dd>
                            </div>
                          ) : null}
                          <div>
                            <dt className="text-slate-500 dark:text-slate-400">
                              Condition
                            </dt>
                            <dd>{it.form.condition}</dd>
                          </div>
                          <div>
                            <dt className="text-slate-500 dark:text-slate-400">
                              Inclusions
                            </dt>
                            <dd className="whitespace-pre-wrap">
                              {it.form.inclusions}
                            </dd>
                          </div>
                          {it.form.datePurchased ? (
                            <div>
                              <dt className="text-slate-500 dark:text-slate-400">
                                Date purchased
                              </dt>
                              <dd>{formatDate(it.form.datePurchased)}</dd>
                            </div>
                          ) : null}
                          {it.form.sourceOfPurchase ? (
                            <div>
                              <dt className="text-slate-500 dark:text-slate-400">
                                Source of purchase
                              </dt>
                              <dd>{it.form.sourceOfPurchase}</dd>
                            </div>
                          ) : null}
                          {it.form.consignmentSellingPrice.trim() ? (
                            <div>
                              <dt className="text-slate-500 dark:text-slate-400">
                                Consignment selling price
                              </dt>
                              <dd className="tabular-nums">
                                {formatPhpDisplay(
                                  it.form.consignmentSellingPrice,
                                )}
                              </dd>
                            </div>
                          ) : null}
                          {it.form.directPurchaseSellingPrice.trim() ? (
                            <div>
                              <dt className="text-slate-500 dark:text-slate-400">
                                Direct purchase selling price
                              </dt>
                              <dd className="tabular-nums">
                                {formatPhpDisplay(
                                  it.form.directPurchaseSellingPrice,
                                )}
                              </dd>
                            </div>
                          ) : null}
                          {it.form.specialInstructions ? (
                            <div>
                              <dt className="text-slate-500 dark:text-slate-400">
                                Special instructions
                              </dt>
                              <dd className="whitespace-pre-wrap">
                                {it.form.specialInstructions}
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                        {it.images.length > 0 ? (
                          <ul className="mt-3 flex flex-wrap gap-2">
                            {it.images.map((img) => (
                              <li
                                key={img.id}
                                className="h-16 w-16 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-600"
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
                          <p className="mt-2 text-xs text-slate-500">
                            No photos
                          </p>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          <form
            onSubmit={onSubmitWalkIn}
            className="flex flex-col gap-3"
          >
            {submitError && (
              <p
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                role="alert"
              >
                {submitError}
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch sm:gap-3">
              <button
                type="button"
                className={`${btnSecondary} w-full sm:flex-1`}
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
              <button
                type="submit"
                className={`${btnPrimary} w-full sm:flex-1`}
                disabled={
                  submitting || items.length === 0 || walkInBranch === ""
                }
                title={
                  items.length === 0
                    ? "Add at least one item"
                    : walkInBranch === ""
                      ? "Select a receiving branch"
                      : undefined
                }
              >
                {submitting ? "Saving…" : "Save inquiries"}
              </button>
            </div>
            {atItemLimit && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                You can add up to {MAX_ITEMS_PER_INQUIRY} items per inquiry.
                Remove an item to add a different one.
              </p>
            )}
          </form>
        </section>
      )}
    </div>
  );
}
