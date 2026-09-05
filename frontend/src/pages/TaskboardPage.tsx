import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { usePortalAuth } from '../context/portal-auth'
import { apiFetch } from '../lib/api'
import { canEditFeature } from '../lib/feature-access'
import { randomId } from '../lib/random-id'
import {
  TASK_PROGRESS_COLUMNS,
  TASK_SEVERITIES,
  TASK_SEVERITY_LABELS,
  boardToReorderItems,
  emptyBoard,
  formatTaskDueDate,
  taskFromLabel,
  taskPortalPath,
  tasksToBoard,
  todayManila,
  type TaskAssignee,
  type TaskAttachment,
  type TaskBoard,
  type TaskProgress,
  type TaskRow,
  type TaskSeverity,
} from '../lib/tasks'

const SEVERITY_CARD: Record<TaskSeverity, string> = {
  critical: 'border-l-red-500',
  high: 'border-l-yellow-400',
  moderate: 'border-l-blue-500',
  low: 'border-l-slate-400',
}

const SEVERITY_BADGE: Record<TaskSeverity, string> = {
  critical:
    'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200',
  high: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-200',
  moderate:
    'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200',
  low: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

const SEVERITY_BUTTON: Record<TaskSeverity, string> = {
  critical:
    'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200',
  high: 'border-yellow-300 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200',
  moderate:
    'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200',
  low: 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
}

const FIELD_CLASS =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100'

const ATTACHMENT_ACCEPT =
  'image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,application/pdf'

const ATTACHMENT_MAX_COUNT = 20

const dropzoneClass =
  'flex min-h-[6.5rem] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/80 px-3 py-4 text-center transition-colors hover:border-violet-400 hover:bg-violet-50/50 focus-within:outline focus-within:ring-2 focus-within:ring-violet-500 dark:border-slate-600 dark:bg-slate-900/60 dark:hover:border-violet-500 dark:hover:bg-violet-950/40 dark:focus-within:ring-violet-400'

type AttachmentPreview = {
  id: string
  file?: File
  previewUrl: string
  storageKey?: string
  filename: string
  isImage: boolean
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  if (file.type !== '') return false
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i.test(file.name.trim())
}

function isAcceptedAttachment(file: File): boolean {
  if (isImageFile(file)) return true
  if (file.type === 'application/pdf' || file.type.startsWith('text/')) return true
  return /\.(pdf|txt|csv|docx?|xlsx?|pptx?|zip)$/i.test(file.name.trim())
}

function isImageAttachment(contentType: string, filename: string | null): boolean {
  if (contentType.startsWith('image/')) return true
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i.test(filename ?? '')
}

function previewsFromSaved(attachments: TaskAttachment[]): AttachmentPreview[] {
  return attachments.map((a) => ({
    id: randomId(),
    previewUrl: a.url,
    storageKey: a.key,
    filename: a.filename?.trim() || a.key.split('/').pop() || 'Attachment',
    isImage: isImageAttachment(a.contentType, a.filename),
  }))
}

function revokeAttachmentPreviews(previews: AttachmentPreview[]): void {
  for (const preview of previews) {
    if (preview.file) URL.revokeObjectURL(preview.previewUrl)
  }
}

function attachmentsChanged(
  original: TaskAttachment[],
  previews: AttachmentPreview[],
): boolean {
  if (previews.some((p) => p.file)) return true
  const retained = previews
    .map((p) => p.storageKey)
    .filter((key): key is string => typeof key === 'string' && key !== '')
  if (retained.length !== original.length) return true
  return retained.some((key, i) => key !== original[i]?.key)
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim())
}

function TaskDescriptionLink({
  value,
  className,
  children,
}: {
  value: string
  className?: string
  children?: string
}) {
  const portalPath = taskPortalPath(value)
  if (portalPath) {
    return (
      <Link to={portalPath} className={className}>
        {children ?? 'Open item'}
      </Link>
    )
  }
  if (isHttpUrl(value)) {
    return (
      <a href={value.trim()} className={className}>
        {children ?? value.trim()}
      </a>
    )
  }
  return null
}

function PaperclipIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.44 11.05l-8.49 8.49a5.25 5.25 0 01-7.42-7.42l8.48-8.49a3.5 3.5 0 014.95 4.95l-8.48 8.49a1.75 1.75 0 01-2.48-2.47l7.78-7.78"
      />
    </svg>
  )
}

function isColumnId(id: string): id is TaskProgress {
  return TASK_PROGRESS_COLUMNS.some((c) => c.id === id)
}

function findColumn(id: string, board: TaskBoard): TaskProgress | null {
  if (isColumnId(id)) return id
  for (const col of TASK_PROGRESS_COLUMNS) {
    if (board[col.id].some((t) => t.id === id)) return col.id
  }
  return null
}

async function readApiError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null)
  if (typeof body?.message === 'string') return body.message
  if (Array.isArray(body?.message)) return body.message.join(', ')
  return fallback
}

export function TaskboardPage() {
  const { token, user, featureAccess } = usePortalAuth()
  const ownEmployeeId = user?.employee?.id
  const canManage = canEditFeature(user?.isAdmin, featureAccess, 'task-management')

  const [board, setBoard] = useState<TaskBoard>(() => emptyBoard())
  const [assignees, setAssignees] = useState<TaskAssignee[]>([])
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<TaskRow | null>(null)
  const snapshotRef = useRef<TaskBoard>(emptyBoard())
  const boardRef = useRef<TaskBoard>(emptyBoard())
  const didDragRef = useRef(false)
  boardRef.current = board

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  const assigneeId = selectedAssigneeId ?? ownEmployeeId ?? undefined

  const loadTasks = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const qs = assigneeId ? `?assigneeId=${encodeURIComponent(assigneeId)}` : ''
      const res = await apiFetch(`/api/tasks${qs}`, {}, token)
      if (!res.ok) {
        throw new Error(await readApiError(res, `Could not load tasks (${res.status})`))
      }
      const rows = (await res.json()) as TaskRow[]
      setBoard(tasksToBoard(rows))
    } catch (e) {
      setBoard(emptyBoard())
      setError(e instanceof Error ? e.message : 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [token, assigneeId])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  useEffect(() => {
    if (!token || !canManage) return
    void (async () => {
      const res = await apiFetch('/api/tasks/assignees', {}, token)
      if (!res.ok) return
      const rows = (await res.json()) as TaskAssignee[]
      setAssignees(rows)
    })()
  }, [token, canManage])

  const persistBoard = async (next: TaskBoard) => {
    if (!token) return
    const items = boardToReorderItems(next)
    const prevItems = boardToReorderItems(snapshotRef.current)
    const prevById = new Map(prevItems.map((i) => [i.id, i]))
    const changed = items.filter((item) => {
      const prev = prevById.get(item.id)
      return !prev || prev.progress !== item.progress || prev.sortOrder !== item.sortOrder
    })
    if (changed.length === 0) return
    try {
      const res = await apiFetch(
        '/api/tasks/reorder',
        {
          method: 'PATCH',
          body: JSON.stringify({ items: changed }),
        },
        token,
      )
      if (!res.ok) {
        setBoard(snapshotRef.current)
        setError(await readApiError(res, 'Could not save task progress'))
      }
    } catch {
      setBoard(snapshotRef.current)
      setError('Could not save task progress')
    }
  }

  const onDragStart = (event: DragStartEvent) => {
    snapshotRef.current = board
    didDragRef.current = true
    setActiveId(String(event.active.id))
    setError(null)
  }

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return
    setBoard((prev) => {
      const activeCol = findColumn(String(active.id), prev)
      const overCol = findColumn(String(over.id), prev)
      if (!activeCol || !overCol || activeCol === overCol) return prev
      const from = [...prev[activeCol]]
      const to = [...prev[overCol]]
      const fromIndex = from.findIndex((t) => t.id === active.id)
      if (fromIndex < 0) return prev
      const [moved] = from.splice(fromIndex, 1)
      if (!moved) return prev
      const overIndex = to.findIndex((t) => t.id === over.id)
      const insertAt = overIndex >= 0 ? overIndex : to.length
      to.splice(insertAt, 0, { ...moved, progress: overCol })
      return { ...prev, [activeCol]: from, [overCol]: to }
    })
  }

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    let next = boardRef.current
    if (over) {
      const activeCol = findColumn(String(active.id), next)
      const overCol = findColumn(String(over.id), next)
      if (activeCol && overCol && activeCol === overCol) {
        const items = next[activeCol]
        const oldIndex = items.findIndex((t) => t.id === active.id)
        const newIndex = items.findIndex((t) => t.id === over.id)
        if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
          next = {
            ...next,
            [activeCol]: arrayMove(items, oldIndex, newIndex),
          }
          setBoard(next)
        }
      }
    }
    void persistBoard(next)
    window.setTimeout(() => {
      didDragRef.current = false
    }, 0)
  }

  const activeTask = useMemo(() => {
    if (!activeId) return null
    for (const col of TASK_PROGRESS_COLUMNS) {
      const found = board[col.id].find((t) => t.id === activeId)
      if (found) return found
    }
    return null
  }, [activeId, board])

  const viewingOther =
    Boolean(ownEmployeeId && assigneeId && assigneeId !== ownEmployeeId)
  const selectedAssignee = assignees.find((a) => a.id === assigneeId)
  const boardTitle = viewingOther
    ? `${selectedAssignee?.firstName ?? ''} ${selectedAssignee?.lastName ?? ''}`.trim() ||
      'Staff board'
    : 'My tasks'

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Taskboard
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {boardTitle}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {canManage && assignees.length > 0 ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Board
              </span>
              <select
                value={assigneeId ?? ''}
                onChange={(e) => setSelectedAssigneeId(e.target.value || null)}
                className={FIELD_CLASS}
              >
                {ownEmployeeId ? (
                  <option value={ownEmployeeId}>My board</option>
                ) : null}
                {assignees
                  .filter((a) => a.id !== ownEmployeeId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.firstName} {a.lastName} ({a.position})
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
            className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 dark:bg-violet-600 dark:hover:bg-violet-500"
          >
            Create task
          </button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          <div className="grid min-h-[28rem] gap-4 md:grid-cols-3">
            {TASK_PROGRESS_COLUMNS.map((col) => (
              <TaskColumn
                key={col.id}
                column={col}
                tasks={board[col.id]}
                onOpen={(task) => {
                  if (didDragRef.current) return
                  setEditing(task)
                  setFormOpen(true)
                }}
              />
            ))}
          </div>
          {createPortal(
            <DragOverlay>
              {activeTask ? <TaskCard task={activeTask} overlay /> : null}
            </DragOverlay>,
            document.body,
          )}
        </DndContext>
      )}

      <TaskFormDialog
        open={formOpen}
        task={editing}
        token={token}
        assigneeId={assigneeId}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onSaved={(saved) => {
          setBoard((prev) => {
            const without = emptyBoard()
            for (const col of TASK_PROGRESS_COLUMNS) {
              without[col.id] = prev[col.id].filter((t) => t.id !== saved.id)
            }
            without[saved.progress] = [...without[saved.progress], saved].sort(
              (a, b) => a.sortOrder - b.sortOrder,
            )
            return without
          })
          setFormOpen(false)
          setEditing(null)
        }}
        onDeleted={(id) => {
          setBoard((prev) => {
            const next = emptyBoard()
            for (const col of TASK_PROGRESS_COLUMNS) {
              next[col.id] = prev[col.id].filter((t) => t.id !== id)
            }
            return next
          })
          setFormOpen(false)
          setEditing(null)
        }}
        onAttachmentWarning={(message) => setError(message)}
      />
    </div>
  )
}

function TaskColumn({
  column,
  tasks,
  onOpen,
}: {
  column: { id: TaskProgress; label: string }
  tasks: TaskRow[]
  onOpen: (task: TaskRow) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })
  return (
    <section
      className={`flex min-h-0 flex-col rounded-xl border bg-slate-50 p-3 dark:bg-slate-950/40 ${
        isOver
          ? 'border-violet-400 dark:border-violet-500'
          : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {column.label}
        </h2>
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {tasks.length}
        </span>
      </header>
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div ref={setNodeRef} className="flex min-h-[12rem] flex-1 flex-col gap-2">
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              onOpen={() => onOpen(task)}
            />
          ))}
        </div>
      </SortableContext>
    </section>
  )
}

function SortableTaskCard({
  task,
  onOpen,
}: {
  task: TaskRow
  onOpen: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} dragging={isDragging} onOpen={onOpen} />
    </div>
  )
}

function TaskCard({
  task,
  overlay,
  dragging,
  onOpen,
}: {
  task: TaskRow
  overlay?: boolean
  dragging?: boolean
  onOpen?: () => void
}) {
  const today = todayManila()
  const overdue = Boolean(
    task.dueDate && task.progress !== 'completed' && task.dueDate < today,
  )
  const fromLabel = taskFromLabel(task)
  const itemPath = taskPortalPath(task.description)
  const showDescriptionText = Boolean(
    task.description && !itemPath && !isHttpUrl(task.description),
  )
  return (
    <article
      className={`rounded-lg border border-slate-200 border-l-4 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 ${SEVERITY_CARD[task.severity]} ${
        overlay ? 'rotate-1 shadow-lg' : ''
      } ${dragging ? 'opacity-40' : ''}`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {task.title}
          </p>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${SEVERITY_BADGE[task.severity]}`}
          >
            {TASK_SEVERITY_LABELS[task.severity]}
          </span>
        </div>
        {showDescriptionText ? (
          <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">
            {task.description}
          </p>
        ) : null}
        {task.dueDate ? (
          <p
            className={`mt-2 text-xs ${
              overdue
                ? 'font-medium text-red-600 dark:text-red-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            Due {formatTaskDueDate(task.dueDate)}
          </p>
        ) : null}
        {fromLabel ? (
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            From {fromLabel}
          </p>
        ) : null}
        {(task.attachments ?? []).length > 0 ? (
          <div className="mt-2 flex items-center gap-1.5">
            {(task.attachments ?? [])
              .filter((a) => isImageAttachment(a.contentType, a.filename))
              .slice(0, 3)
              .map((a) => (
                <img
                  key={a.key}
                  src={a.url}
                  alt=""
                  className="h-8 w-8 rounded object-cover ring-1 ring-slate-200 dark:ring-slate-700"
                />
              ))}
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
              <PaperclipIcon className="h-3 w-3" />
              {(task.attachments ?? []).length}
            </span>
          </div>
        ) : null}
      </button>
      {task.description && (itemPath || isHttpUrl(task.description)) ? (
        <span
          className="mt-1 block"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <TaskDescriptionLink
            value={task.description}
            className="block truncate text-xs font-medium text-violet-700 hover:underline dark:text-violet-300"
          />
        </span>
      ) : null}
    </article>
  )
}

function TaskFormDialog({
  open,
  task,
  token,
  assigneeId,
  onClose,
  onSaved,
  onDeleted,
  onAttachmentWarning,
}: {
  open: boolean
  task: TaskRow | null
  token: string | null
  assigneeId: string | undefined
  onClose: () => void
  onSaved: (task: TaskRow) => void
  onDeleted: (id: string) => void
  onAttachmentWarning: (message: string) => void
}) {
  const titleId = useId()
  const fileInputId = useId()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [severity, setSeverity] = useState<TaskSeverity>('moderate')
  const [attachments, setAttachments] = useState<AttachmentPreview[]>([])
  const [dropActive, setDropActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const attachmentsRef = useRef<AttachmentPreview[]>([])
  attachmentsRef.current = attachments

  useEffect(() => {
    if (!open) return
    setTitle(task?.title ?? '')
    setDescription(task?.description ?? '')
    setDueDate(task?.dueDate ?? '')
    setSeverity(task?.severity ?? 'moderate')
    setAttachments(previewsFromSaved(task?.attachments ?? []))
    setDropActive(false)
    setFormError(null)
    setBusy(false)
    setConfirmDelete(false)
    setDeleteBusy(false)
    setDeleteError(null)
    return () => {
      revokeAttachmentPreviews(attachmentsRef.current)
    }
  }, [open, task])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy && !deleteBusy && !confirmDelete) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, deleteBusy, confirmDelete, onClose])

  if (!open || typeof document === 'undefined') return null

  const fromLabel = task ? taskFromLabel(task) : null
  const itemPath = taskPortalPath(description)
  const linkOnlyDescription = Boolean(
    itemPath && (description.trim() === itemPath || isHttpUrl(description)),
  )

  const addAttachmentFiles = (fileList: FileList | File[]) => {
    const list = Array.from(fileList).filter(isAcceptedAttachment)
    if (list.length === 0) return
    setAttachments((prev) => {
      const remaining = ATTACHMENT_MAX_COUNT - prev.length
      if (remaining <= 0) return prev
      return [
        ...prev,
        ...list.slice(0, remaining).map((file) => ({
          id: randomId(),
          file,
          previewUrl: URL.createObjectURL(file),
          filename: file.name,
          isImage: isImageFile(file),
        })),
      ]
    })
  }

  const removeAttachmentAt = (attachmentId: string) => {
    setAttachments((prev) => {
      const item = prev.find((p) => p.id === attachmentId)
      if (item?.file) URL.revokeObjectURL(item.previewUrl)
      return prev.filter((p) => p.id !== attachmentId)
    })
  }

  const uploadAttachments = async (taskId: string): Promise<TaskRow> => {
    const retainedKeys = attachments
      .map((p) => p.storageKey)
      .filter((key): key is string => typeof key === 'string' && key !== '')
    const fd = new FormData()
    fd.append('retainedKeys', JSON.stringify(retainedKeys))
    for (const item of attachments) {
      if (item.file) fd.append('files', item.file)
    }
    const res = await apiFetch(
      `/api/tasks/${taskId}/attachments`,
      { method: 'POST', body: fd },
      token,
    )
    if (!res.ok) {
      throw new Error(await readApiError(res, 'Could not upload attachments'))
    }
    return (await res.json()) as TaskRow
  }

  const submit = async () => {
    if (!token) return
    const trimmed = title.trim()
    if (!trimmed) {
      setFormError('Title is required')
      return
    }
    setBusy(true)
    setFormError(null)
    try {
      const payload: {
        title: string
        description?: string | null
        dueDate?: string | null
        severity: TaskSeverity
        assigneeId?: string
      } = {
        title: trimmed,
        severity,
      }
      if (task) {
        payload.description = itemPath ?? (description.trim() || null)
        payload.dueDate = dueDate || null
      } else {
        if (itemPath) payload.description = itemPath
        else if (description.trim()) payload.description = description.trim()
        if (dueDate) payload.dueDate = dueDate
        if (assigneeId) payload.assigneeId = assigneeId
      }
      const res = await apiFetch(
        task ? `/api/tasks/${task.id}` : '/api/tasks',
        {
          method: task ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        },
        token,
      )
      if (!res.ok) {
        throw new Error(
          await readApiError(res, task ? 'Could not save task' : 'Could not create task'),
        )
      }
      let saved = (await res.json()) as TaskRow
      const original = task?.attachments ?? []
      if (attachmentsChanged(original, attachments)) {
        try {
          saved = await uploadAttachments(saved.id)
        } catch (e) {
          onSaved({ ...saved, attachments: saved.attachments ?? [] })
          onAttachmentWarning(
            e instanceof Error
              ? `Task saved, but attachments could not be uploaded: ${e.message}`
              : 'Task saved, but attachments could not be uploaded. Open the task to add them again.',
          )
          return
        }
      }
      onSaved({ ...saved, attachments: saved.attachments ?? [] })
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!token || !task) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      const res = await apiFetch(
        `/api/tasks/${task.id}`,
        { method: 'DELETE' },
        token,
      )
      if (!res.ok) {
        throw new Error(await readApiError(res, 'Could not delete task'))
      }
      setConfirmDelete(false)
      onDeleted(task.id)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Could not delete task')
    } finally {
      setDeleteBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="Dismiss"
        disabled={busy || deleteBusy}
        onClick={() => !busy && !deleteBusy && !confirmDelete && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        <h2
          id={titleId}
          className="text-base font-semibold text-slate-900 dark:text-slate-100"
        >
          {task ? 'Edit task' : 'Create task'}
        </h2>
        {fromLabel ? (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            From {fromLabel}
          </p>
        ) : null}
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
              Title
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className={FIELD_CLASS}
              autoFocus
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
              Description
            </span>
            {linkOnlyDescription ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
                <TaskDescriptionLink
                  value={description}
                  className="text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
                />
              </div>
            ) : (
              <>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={4000}
                  className={FIELD_CLASS}
                />
                {isHttpUrl(description) ? (
                  <TaskDescriptionLink
                    value={description}
                    className="mt-1 inline-block text-xs font-medium text-violet-700 hover:underline dark:text-violet-300"
                  >
                    Open link
                  </TaskDescriptionLink>
                ) : null}
              </>
            )}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
              Due date
            </span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={FIELD_CLASS}
            />
          </label>
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">
              Severity
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TASK_SEVERITIES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeverity(s)}
                  className={`rounded-lg border px-2 py-1.5 text-xs font-medium ${
                    severity === s
                      ? SEVERITY_BUTTON[s]
                      : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                  }`}
                >
                  {TASK_SEVERITY_LABELS[s]}
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Files & photos
            </span>
            <input
              id={fileInputId}
              type="file"
              accept={ATTACHMENT_ACCEPT}
              multiple
              className="sr-only"
              disabled={busy || deleteBusy}
              onChange={(e) => {
                if (e.target.files?.length) addAttachmentFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <label
              htmlFor={fileInputId}
              className={`${dropzoneClass} ${
                dropActive
                  ? 'border-violet-500 bg-violet-50 dark:border-violet-400 dark:bg-violet-950/50'
                  : ''
              }`}
              onDragEnter={(e) => {
                e.preventDefault()
                setDropActive(true)
              }}
              onDragLeave={(e) => {
                e.preventDefault()
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDropActive(false)
                }
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setDropActive(false)
                if (e.dataTransfer.files?.length) {
                  addAttachmentFiles(e.dataTransfer.files)
                }
              }}
            >
              <PaperclipIcon className="h-5 w-5 text-slate-400" />
              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                Drop files or photos here
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Images, PDF, or office files — up to {ATTACHMENT_MAX_COUNT}.
              </span>
            </label>
            {attachments.length > 0 ? (
              <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {attachments.map((item) => (
                  <li
                    key={item.id}
                    className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-800"
                  >
                    {item.isImage ? (
                      <a
                        href={item.previewUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="relative block aspect-square"
                      >
                        <img
                          src={item.previewUrl}
                          alt={item.filename}
                          className="h-full w-full object-cover"
                        />
                      </a>
                    ) : (
                      <a
                        href={item.previewUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex aspect-square flex-col items-center justify-center gap-1 px-2 text-center"
                      >
                        <PaperclipIcon className="h-6 w-6 text-slate-400" />
                        <span className="line-clamp-2 w-full break-all text-[11px] text-slate-600 dark:text-slate-300">
                          {item.filename}
                        </span>
                      </a>
                    )}
                    <div className="flex items-center justify-between gap-1 border-t border-slate-200 px-2 py-1 dark:border-slate-600">
                      <span className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {item.filename}
                      </span>
                      <button
                        type="button"
                        disabled={busy || deleteBusy}
                        onClick={() => removeAttachmentAt(item.id)}
                        className="shrink-0 text-[11px] font-medium text-red-600 hover:text-red-700 disabled:opacity-50 dark:text-red-400"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        {formError ? (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          >
            {formError}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          {task?.canDelete ? (
            <button
              type="button"
              disabled={busy || deleteBusy}
              onClick={() => {
                setDeleteError(null)
                setConfirmDelete(true)
              }}
              className="mr-auto rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              Delete
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy || deleteBusy}
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || deleteBusy}
            onClick={() => void submit()}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
          >
            {busy ? 'Saving…' : task ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete task?"
        description={
          task ? `This will permanently delete “${task.title}”.` : ''
        }
        confirmLabel="Delete"
        danger
        busy={deleteBusy}
        errorMessage={deleteError}
        overlayClassName="z-[110]"
        onCancel={() => {
          if (!deleteBusy) setConfirmDelete(false)
        }}
        onConfirm={() => void remove()}
      />
    </div>,
    document.body,
  )
}
