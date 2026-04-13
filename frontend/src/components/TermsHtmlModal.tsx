import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  open: boolean
  onClose: () => void
  /** Public URL, e.g. `/terms/consignment.txt` */
  url: string
  /** Dialog title (visible heading). */
  title: string
}

export function TermsHtmlModal({ open, onClose, url, title }: Props) {
  const titleId = useId()
  const cacheRef = useRef<Map<string, string>>(new Map())
  const [body, setBody] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    const cached = cacheRef.current.get(url)
    if (cached) {
      setBody(cached)
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setBody(null)

    void fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load (${res.status})`)
        return res.text()
      })
      .then((text) => {
        const trimmed = text.trim()
        if (!cancelled) {
          cacheRef.current.set(url, trimmed)
          setBody(trimmed)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not load terms. Please try again.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, url])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="Close terms"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[min(85vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading && (
            <p className="text-sm text-slate-600">Loading…</p>
          )}
          {error && <p className="text-sm text-red-700">{error}</p>}
          {!loading && !error && body !== null && (
            <div
              className="text-sm leading-relaxed text-slate-700 [&_li]:mb-2 [&_ul]:list-disc [&_ul]:pl-5"
              dangerouslySetInnerHTML={{ __html: body }}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
