import {
  type ColumnFiltersState,
  type ColumnPinningState,
  type SortingState,
} from '@tanstack/react-table'
import { apiFetch } from './api'

const PORTAL_TOKEN_KEY = 'baghub_portal_token'
const CLIENT_TOKEN_KEY = 'baghub_client_token'

export type TablePreferenceConfig = {
  version: 1
  columnOrder?: string[]
  columnPinning?: ColumnPinningState
  sorting?: SortingState
  columnFilters?: ColumnFiltersState
  globalFilter?: string
  pagination?: {
    pageSize?: number
  }
}

type TablePreferenceResponse = {
  tableId: string
  config: TablePreferenceConfig | null
}

function getCurrentAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  const primaryKey = window.location.pathname.startsWith('/portal')
    ? PORTAL_TOKEN_KEY
    : CLIENT_TOKEN_KEY
  const secondaryKey =
    primaryKey === PORTAL_TOKEN_KEY ? CLIENT_TOKEN_KEY : PORTAL_TOKEN_KEY
  return localStorage.getItem(primaryKey) ?? localStorage.getItem(secondaryKey)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const strings = value.filter((item): item is string => typeof item === 'string')
  return strings.length ? strings : undefined
}

function sanitizeColumnPinning(value: unknown): ColumnPinningState | undefined {
  if (!isRecord(value)) return undefined
  const left = stringArray(value.left) ?? []
  const right = stringArray(value.right) ?? []
  if (!left.length && !right.length) return undefined
  return { left, right }
}

function sanitizeSorting(value: unknown): SortingState | undefined {
  if (!Array.isArray(value)) return undefined
  const sorting = value
    .filter(isRecord)
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      desc: Boolean(item.desc),
    }))
    .filter((item) => item.id)
  return sorting.length ? sorting : undefined
}

function sanitizeColumnFilters(value: unknown): ColumnFiltersState | undefined {
  if (!Array.isArray(value)) return undefined
  const filters = value
    .filter(isRecord)
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      value: item.value,
    }))
    .filter((item) => item.id)
  return filters.length ? filters : undefined
}

export function normalizeTablePreferenceConfig(
  value: unknown,
): TablePreferenceConfig | null {
  if (!isRecord(value) || value.version !== 1) return null
  const globalFilter =
    typeof value.globalFilter === 'string' ? value.globalFilter : undefined
  const pageSize = isRecord(value.pagination)
    ? Number(value.pagination.pageSize)
    : NaN

  return {
    version: 1,
    ...(stringArray(value.columnOrder)
      ? { columnOrder: stringArray(value.columnOrder) }
      : {}),
    ...(sanitizeColumnPinning(value.columnPinning)
      ? { columnPinning: sanitizeColumnPinning(value.columnPinning) }
      : {}),
    ...(sanitizeSorting(value.sorting)
      ? { sorting: sanitizeSorting(value.sorting) }
      : {}),
    ...(sanitizeColumnFilters(value.columnFilters)
      ? { columnFilters: sanitizeColumnFilters(value.columnFilters) }
      : {}),
    ...(globalFilter ? { globalFilter } : {}),
    ...(Number.isFinite(pageSize) && pageSize > 0
      ? { pagination: { pageSize } }
      : {}),
  }
}

export async function loadTablePreference(
  tableId: string,
): Promise<TablePreferenceConfig | null> {
  const token = getCurrentAuthToken()
  if (!token) return null
  const res = await apiFetch(
    `/api/table-preferences/${encodeURIComponent(tableId)}`,
    {},
    token,
  )
  if (!res.ok) return null
  const body = (await res.json().catch(() => null)) as TablePreferenceResponse | null
  return normalizeTablePreferenceConfig(body?.config)
}

export async function saveTablePreference(
  tableId: string,
  config: TablePreferenceConfig,
): Promise<void> {
  const token = getCurrentAuthToken()
  if (!token) return
  const res = await apiFetch(
    `/api/table-preferences/${encodeURIComponent(tableId)}`,
    {
      method: 'PATCH',
      keepalive: true,
      body: JSON.stringify({ config }),
    },
    token,
  )
  if (!res.ok) {
    throw new Error('Failed to save table preferences')
  }
}
