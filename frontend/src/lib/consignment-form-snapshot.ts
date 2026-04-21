import {
  emptyConsignItemForm,
  type ConsignItemFormData,
  type DraftConsignItem,
  type LocalConsignImage,
} from '../types/consign-inquiry'

export const CONSIGNMENT_FORM_SNAPSHOT_VERSION = 1 as const

export type ConsignWizardStep = 1 | 2 | 3

export type SerializedConsignImage = {
  dataUrl: string
  name: string
  type: string
}

export type SerializedDraftItem = {
  id: string
  form: ConsignItemFormData
  images: SerializedConsignImage[]
}

export type ConsignmentFormSnapshotV1 = {
  version: typeof CONSIGNMENT_FORM_SNAPSHOT_VERSION
  step: ConsignWizardStep
  items: SerializedDraftItem[]
  draftForm: ConsignItemFormData
  draftImages: SerializedConsignImage[]
  editingItemId: string | null
  editInsertIndex: number | null
  editBackup: SerializedDraftItem | null
  inquiryConsignmentTermsAccepted: boolean
  reviewExpandedById: Record<string, boolean>
}

export function emptyConsignmentFormSnapshot(): ConsignmentFormSnapshotV1 {
  return {
    version: CONSIGNMENT_FORM_SNAPSHOT_VERSION,
    step: 1,
    items: [],
    draftForm: emptyConsignItemForm(),
    draftImages: [],
    editingItemId: null,
    editInsertIndex: null,
    editBackup: null,
    inquiryConsignmentTermsAccepted: false,
    reviewExpandedById: {},
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () =>
      resolve(typeof r.result === 'string' ? r.result : '')
    r.onerror = () => reject(r.error ?? new Error('read failed'))
    r.readAsDataURL(file)
  })
}

function dataUrlToFile(
  dataUrl: string,
  filename: string,
  fallbackType: string,
): File {
  const parts = dataUrl.split(',')
  const header = parts[0] ?? ''
  const b64 = parts[1] ?? ''
  const mimeMatch = /data:([^;]+)/.exec(header)
  const mime = mimeMatch?.[1]?.trim() || fallbackType
  const binary = atob(b64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], filename, { type: mime })
}

export async function serializeDraftItem(
  it: DraftConsignItem,
): Promise<SerializedDraftItem> {
  const images = await Promise.all(
    it.images.map(async (i) => ({
      dataUrl: await readFileAsDataUrl(i.file),
      name: i.file.name,
      type: i.file.type || 'application/octet-stream',
    })),
  )
  return { id: it.id, form: { ...it.form }, images }
}

export function deserializeDraftItem(ser: SerializedDraftItem): DraftConsignItem {
  const images: LocalConsignImage[] = ser.images.map((s) => {
    const file = dataUrlToFile(s.dataUrl, s.name, s.type)
    return {
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }
  })
  return { id: ser.id, form: { ...ser.form }, images }
}

export function isSnapshotV1(v: unknown): v is ConsignmentFormSnapshotV1 {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  if (o.version !== CONSIGNMENT_FORM_SNAPSHOT_VERSION) return false
  if (o.step !== 1 && o.step !== 2 && o.step !== 3) return false
  if (!Array.isArray(o.items)) return false
  if (!o.draftForm || typeof o.draftForm !== 'object') return false
  if (!Array.isArray(o.draftImages)) return false
  if (!('editingItemId' in o)) return false
  if (!('editInsertIndex' in o)) return false
  if (!('inquiryConsignmentTermsAccepted' in o)) return false
  return true
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`
}

export function hydrateFromSnapshot(snap: ConsignmentFormSnapshotV1): {
  step: ConsignWizardStep
  items: DraftConsignItem[]
  draftForm: ConsignItemFormData
  draftImages: LocalConsignImage[]
  editingItemId: string | null
  editInsertIndex: number | null
  editBackup: DraftConsignItem | null
  inquiryConsignmentTermsAccepted: boolean
  reviewExpandedById: Record<string, boolean>
} {
  const items = snap.items.map(deserializeDraftItem)
  const draftImages: LocalConsignImage[] = snap.draftImages.map((s) => {
    const file = dataUrlToFile(s.dataUrl, s.name, s.type)
    return {
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }
  })
  const editBackup =
    snap.editBackup != null
      ? deserializeDraftItem(snap.editBackup)
      : null
  return {
    step: snap.step,
    items,
    draftForm: { ...snap.draftForm },
    draftImages,
    editingItemId: snap.editingItemId,
    editInsertIndex: snap.editInsertIndex,
    editBackup,
    inquiryConsignmentTermsAccepted: snap.inquiryConsignmentTermsAccepted,
    reviewExpandedById: { ...(snap.reviewExpandedById ?? {}) },
  }
}

export async function buildSnapshotFromWizardState(
  step: ConsignWizardStep,
  items: DraftConsignItem[],
  draftForm: ConsignItemFormData,
  draftImages: LocalConsignImage[],
  editingItemId: string | null,
  editInsertIndex: number | null,
  editBackup: DraftConsignItem | null,
  inquiryConsignmentTermsAccepted: boolean,
  reviewExpandedById: Record<string, boolean>,
): Promise<ConsignmentFormSnapshotV1> {
  const serializedItems = await Promise.all(items.map(serializeDraftItem))
  const draftImagesSer = await Promise.all(
    draftImages.map(async (i) => ({
      dataUrl: await readFileAsDataUrl(i.file),
      name: i.file.name,
      type: i.file.type || 'application/octet-stream',
    })),
  )
  const editBackupSer = editBackup
    ? await serializeDraftItem(editBackup)
    : null
  return {
    version: CONSIGNMENT_FORM_SNAPSHOT_VERSION,
    step,
    items: serializedItems,
    draftForm: { ...draftForm },
    draftImages: draftImagesSer,
    editingItemId,
    editInsertIndex,
    editBackup: editBackupSer,
    inquiryConsignmentTermsAccepted,
    reviewExpandedById: { ...reviewExpandedById },
  }
}
