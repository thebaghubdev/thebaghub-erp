import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/useApp'
import { usePortalAuth } from '../context/portal-auth'
import { apiFetch } from '../lib/api'

const GENERAL_CATEGORY = 'General'

type SettingRow = {
  id: string
  key: string
  title: string
  description: string | null
  category: string
  type: string
  value: string
}

function parseStringArray(raw: string): string[] | null {
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) return null
    if (!v.every((x) => typeof x === 'string')) return null
    return v
  } catch {
    return null
  }
}

function summarizeValue(s: SettingRow): string {
  if (s.type === 'string[]') {
    const arr = parseStringArray(s.value)
    if (!arr || arr.length === 0) return '—'
    if (arr.length <= 3) return arr.join(', ')
    return `${arr.slice(0, 3).join(', ')}… (+${arr.length - 3} more)`
  }
  if (s.type === 'number') {
    return s.value
  }
  const t = s.value
  if (t.length <= 120) return t
  return `${t.slice(0, 120)}…`
}

type StringArrayEditState = {
  options: string[]
  selected: Set<string>
}

function buildStringArrayValue(state: StringArrayEditState): string {
  const out = state.options.filter((o) => state.selected.has(o))
  return JSON.stringify(out)
}

export function SettingsPage() {
  const { token } = usePortalAuth()
  const { theme, toggleTheme } = useApp()
  const [rows, setRows] = useState<SettingRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draftValue, setDraftValue] = useState('')
  const [stringArrayEdit, setStringArrayEdit] =
    useState<StringArrayEditState | null>(null)
  const [stringArrayAdd, setStringArrayAdd] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const loadSettings = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await apiFetch('/api/settings', {}, token)
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const data = (await res.json()) as SettingRow[]
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.description?.toLowerCase().includes(q) ?? false) ||
        s.category.toLowerCase().includes(q) ||
        s.value.toLowerCase().includes(q),
    )
  }, [rows, search])

  const grouped = useMemo(() => {
    const m = new Map<string, SettingRow[]>()
    for (const s of filtered) {
      const list = m.get(s.category) ?? []
      list.push(s)
      m.set(s.category, list)
    }
    const hasGeneralInApp = rows.some((r) => r.category === GENERAL_CATEGORY)
    if (hasGeneralInApp && !m.has(GENERAL_CATEGORY)) {
      m.set(GENERAL_CATEGORY, [])
    }
    return [...m.entries()].sort((a, b) => {
      if (a[0] === GENERAL_CATEGORY && b[0] !== GENERAL_CATEGORY) return -1
      if (b[0] === GENERAL_CATEGORY && a[0] !== GENERAL_CATEGORY) return 1
      return a[0].localeCompare(b[0])
    })
  }, [filtered, rows])

  const beginEdit = (s: SettingRow) => {
    setSaveError(null)
    setStringArrayAdd('')
    setEditingKey(s.key)
    if (s.type === 'string[]') {
      const parsed = parseStringArray(s.value)
      const options = parsed ?? []
      setStringArrayEdit({
        options: [...options],
        selected: new Set(options),
      })
      setDraftValue('')
    } else {
      setStringArrayEdit(null)
      setDraftValue(s.value)
    }
  }

  const cancelEdit = () => {
    setEditingKey(null)
    setDraftValue('')
    setStringArrayEdit(null)
    setStringArrayAdd('')
    setSaveError(null)
  }

  const toggleStringArray = (opt: string) => {
    setStringArrayEdit((prev) => {
      if (!prev) return prev
      const next = new Set(prev.selected)
      if (next.has(opt)) next.delete(opt)
      else next.add(opt)
      return { ...prev, selected: next }
    })
  }

  const addStringArrayOption = () => {
    const t = stringArrayAdd.trim()
    if (!t || !stringArrayEdit) return
    if (stringArrayEdit.options.includes(t)) {
      setStringArrayAdd('')
      return
    }
    setStringArrayEdit({
      options: [...stringArrayEdit.options, t],
      selected: new Set([...stringArrayEdit.selected, t]),
    })
    setStringArrayAdd('')
  }

  const saveEdit = async () => {
    if (!editingKey || !token) return
    const row = rows.find((r) => r.key === editingKey)
    if (!row) return

    let valueToSave: string
    if (row.type === 'string[]') {
      if (!stringArrayEdit) {
        setSaveError('Nothing to save.')
        return
      }
      valueToSave = buildStringArrayValue(stringArrayEdit)
    } else if (row.type === 'number') {
      const n = Number(draftValue)
      if (draftValue.trim() === '' || Number.isNaN(n)) {
        setSaveError('Enter a valid number.')
        return
      }
      valueToSave = String(n)
    } else {
      valueToSave = draftValue
    }

    setSaveError(null)
    setSaving(true)
    try {
      const res = await apiFetch(
        `/api/settings/${encodeURIComponent(editingKey)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ value: valueToSave }),
        },
        token,
      )
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `Save failed (${res.status})`)
      }
      const updated = (await res.json()) as SettingRow
      setRows((prev) =>
        prev.map((r) => (r.key === updated.key ? updated : r)),
      )
      cancelEdit()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500'

  const renderValueEditor = (s: SettingRow) => {
    if (s.type === 'string[]' && stringArrayEdit) {
      return (
        <div className="space-y-3">
          <div
            className="max-h-60 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-950/40"
            role="group"
            aria-label={`Select options for ${s.title}`}
          >
            {stringArrayEdit.options.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No items yet. Add one below.
              </p>
            ) : (
              stringArrayEdit.options.map((opt) => (
                <label
                  key={opt}
                  className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-0.5 text-sm text-slate-800 hover:bg-white dark:text-slate-200 dark:hover:bg-slate-800/80"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 shrink-0 rounded border-slate-300 text-violet-600 focus:ring-violet-500 dark:border-slate-600"
                    checked={stringArrayEdit.selected.has(opt)}
                    onChange={() => toggleStringArray(opt)}
                  />
                  <span className="min-w-0 break-words">{opt}</span>
                </label>
              ))
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={stringArrayAdd}
              onChange={(e) => setStringArrayAdd(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addStringArrayOption()
                }
              }}
              placeholder="Add new item…"
              className={inputClass}
            />
            <button
              type="button"
              onClick={addStringArrayOption}
              className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Add
            </button>
          </div>
        </div>
      )
    }

    if (s.type === 'number') {
      return (
        <input
          type="number"
          inputMode="decimal"
          value={draftValue}
          onChange={(e) => setDraftValue(e.target.value)}
          className={inputClass}
          aria-label={`Value for ${s.title}`}
        />
      )
    }

    return (
      <input
        type="text"
        value={draftValue}
        onChange={(e) => setDraftValue(e.target.value)}
        className={inputClass}
        aria-label={`Value for ${s.title}`}
      />
    )
  }

  const renderValueReadOnly = (s: SettingRow) => (
    <span className="block text-sm text-slate-800 dark:text-slate-200">
      {summarizeValue(s)}
    </span>
  )

  return (
    <div className="w-full min-w-0">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Search settings</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, category, description, or value…"
            className={inputClass}
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          onClick={() => void loadSettings()}
          className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
        >
          Refresh
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {loading && rows.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            Loading…
          </p>
        )}
        {!loading && rows.length === 0 && !error && (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            No settings found.
          </p>
        )}
        {!loading &&
          rows.length > 0 &&
          filtered.length === 0 &&
          !rows.some((r) => r.category === GENERAL_CATEGORY) && (
            <p className="px-4 py-10 text-center text-sm text-slate-500">
              No settings match your search.
            </p>
          )}

        {grouped.map(([category, list]) => (
          <section
            key={category}
            className="border-b border-slate-200 last:border-b-0 dark:border-slate-800"
          >
            <h3 className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
              {category}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] table-fixed border-collapse text-left text-sm">
                <colgroup>
                  <col className="w-[18%]" />
                  <col className="w-[34%]" />
                  <col />
                  <col className="w-32" />
                </colgroup>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {category === GENERAL_CATEGORY && (
                    <tr className="align-top hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="min-w-0 align-top px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                        Appearance
                      </td>
                      <td className="min-w-0 align-top px-4 py-3 text-slate-600 dark:text-slate-400">
                        Switch between light and dark interface for the app.
                      </td>
                      <td className="min-w-0 align-top px-4 py-3">
                        <button
                          type="button"
                          onClick={toggleTheme}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                        >
                          {theme === 'light' ? 'Dark mode' : 'Light mode'}
                        </button>
                        <span className="mt-2 block text-xs text-slate-500 dark:text-slate-400">
                          Currently using{' '}
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {theme === 'light' ? 'light' : 'dark'}
                          </span>{' '}
                          theme.
                        </span>
                      </td>
                      <td className="align-top px-4 py-3 text-right text-slate-400 dark:text-slate-600">
                        —
                      </td>
                    </tr>
                  )}
                  {list.map((s) => {
                    const isEditing = editingKey === s.key
                    return (
                      <tr
                        key={s.id}
                        className="align-top hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        <td className="min-w-0 align-top px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                          {s.title}
                        </td>
                        <td className="min-w-0 align-top px-4 py-3 text-slate-600 dark:text-slate-400">
                          {s.description ?? '—'}
                        </td>
                        <td className="min-w-0 align-top px-4 py-3">
                          {isEditing
                            ? renderValueEditor(s)
                            : renderValueReadOnly(s)}
                        </td>
                        <td className="align-top px-4 py-3 text-right">
                          {isEditing ? (
                            <div className="flex flex-col items-end gap-2">
                              {saveError && (
                                <p className="max-w-[14rem] text-left text-xs text-red-600 dark:text-red-400">
                                  {saveError}
                                </p>
                              )}
                              <div className="flex flex-wrap justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  disabled={saving}
                                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void saveEdit()}
                                  disabled={saving}
                                  className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                                >
                                  {saving ? 'Saving…' : 'Save'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => beginEdit(s)}
                              className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-900 hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-200 dark:hover:bg-violet-950"
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
