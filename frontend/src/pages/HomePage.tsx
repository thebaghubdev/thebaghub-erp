import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/useAuth'
import { apiFetch } from '../lib/api'

type Item = {
  id: string
  title: string
  createdAt: string
}

export function HomePage() {
  const { token } = useAuth()
  const [items, setItems] = useState<Item[]>([])
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadItems = useCallback(async () => {
    setError(null)
    try {
      const res = await apiFetch('/api/items', {}, token)
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const data = (await res.json()) as Item[]
      setItems(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load items')
    }
  }, [token])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch(
        '/api/items',
        {
          method: 'POST',
          body: JSON.stringify({ title: trimmed }),
        },
        token,
      )
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(
          body?.message ?? `Create failed (${res.status})`,
        )
      }
      setTitle('')
      await loadItems()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create item')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full min-w-0">
      <h2 className="mb-2 text-lg font-medium">Home</h2>
      <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
        Use the sidenav to open <strong>Inquiry</strong>.
      </p>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-4 text-base font-medium">Items (demo)</h3>

        <form
          onSubmit={onSubmit}
          className="mb-6 flex flex-col gap-3 sm:flex-row"
        >
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New item title"
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none ring-violet-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-violet-600 px-4 py-2 font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Add'}
          </button>
        </form>

        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        )}

        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {items.length === 0 && !error && (
            <li className="py-6 text-center text-sm text-slate-500">
              No items yet. Add one above (API + Postgres must be running).
            </li>
          )}
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="font-medium">{item.title}</span>
              <span className="text-xs text-slate-500">
                {new Date(item.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
