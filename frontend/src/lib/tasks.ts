export const TASK_SEVERITIES = [
  'critical',
  'high',
  'moderate',
  'low',
] as const
export type TaskSeverity = (typeof TASK_SEVERITIES)[number]

export const TASK_PROGRESS = [
  'pending',
  'in_progress',
  'completed',
] as const
export type TaskProgress = (typeof TASK_PROGRESS)[number]

export const TASK_SEVERITY_LABELS: Record<TaskSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
}

export const TASK_PROGRESS_COLUMNS: {
  id: TaskProgress
  label: string
}[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
]

export type TaskAttachment = {
  key: string
  url: string
  contentType: string
  filename: string | null
}

export type TaskRow = {
  id: string
  assigneeId: string
  title: string
  description: string | null
  dueDate: string | null
  severity: TaskSeverity
  progress: TaskProgress
  sortOrder: number
  createdAt: string
  createdById: string | null
  createdByName: string | null
  canDelete: boolean
  attachments: TaskAttachment[]
}

export type TaskAssignee = {
  id: string
  firstName: string
  lastName: string
  position: string
}

export type TaskBoard = Record<TaskProgress, TaskRow[]>

export function emptyBoard(): TaskBoard {
  return { pending: [], in_progress: [], completed: [] }
}

export function tasksToBoard(tasks: TaskRow[]): TaskBoard {
  const board = emptyBoard()
  for (const task of tasks) {
    board[task.progress].push({
      ...task,
      attachments: task.attachments ?? [],
    })
  }
  for (const col of TASK_PROGRESS_COLUMNS) {
    board[col.id].sort((a, b) => a.sortOrder - b.sortOrder)
  }
  return board
}

export function boardToReorderItems(board: TaskBoard) {
  return TASK_PROGRESS_COLUMNS.flatMap((col) =>
    board[col.id].map((task, index) => ({
      id: task.id,
      progress: col.id,
      sortOrder: index,
    })),
  )
}

export function todayManila(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function formatTaskDueDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return isoDate
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(y, m - 1, d))
}
