import { formatDistanceToNow } from "date-fns"
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import { io, type Socket } from "socket.io-client"
import { usePortalAuth } from "../context/portal-auth"
import { apiFetch } from "../lib/api"
import { ConfirmDialog } from "./ConfirmDialog"

export type NotificationRow = {
  id: string
  message: string
  isRead: boolean
  receiverId: string
  receiverRole: string | null
  inquiryId: string | null
  orderId?: string | null
  walkInAuthenticationId?: string | null
  createdAt: string
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
      />
    </svg>
  )
}

function socketBaseUrl() {
  if (import.meta.env.VITE_SOCKET_URL?.trim()) {
    return import.meta.env.VITE_SOCKET_URL.trim().replace(/\/$/, "")
  }
  if (typeof window === "undefined") {
    return ""
  }
  return window.location.origin
}

export function NotificationBell() {
  const { token, user, loading: authLoading } = usePortalAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState<NotificationRow[]>([])
  const [panelLoading, setPanelLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [clearAllOpen, setClearAllOpen] = useState(false)
  const [clearAllBusy, setClearAllBusy] = useState(false)
  const [clearAllError, setClearAllError] = useState<string | null>(null)
  const socketRef = useRef<Socket | null>(null)

  const employeeId = user?.employee?.id

  const refreshUnread = useCallback(async () => {
    if (!token) return
    const res = await apiFetch("/api/notifications/unread-count", {}, token)
    if (!res.ok) return
    const j = (await res.json()) as { count: number }
    setUnread(j.count)
  }, [token])

  const loadList = useCallback(async () => {
    if (!token) return
    setPanelLoading(true)
    setListError(null)
    try {
      const res = await apiFetch("/api/notifications?take=100", {}, token)
      if (!res.ok) {
        setListError("Could not load notifications")
        return
      }
      const data = (await res.json()) as NotificationRow[]
      setItems(data)
      void refreshUnread()
    } catch {
      setListError("Could not load notifications")
    } finally {
      setPanelLoading(false)
    }
  }, [token, refreshUnread])

  useEffect(() => {
    if (authLoading || !token || !employeeId) {
      setUnread(0)
      return
    }
    void refreshUnread()
  }, [authLoading, token, employeeId, refreshUnread])

  useEffect(() => {
    if (authLoading || !token || !employeeId) {
      return
    }

    const base = socketBaseUrl()
    const socket: Socket = io(`${base}/notifications`, {
      path: "/socket.io",
      auth: { token },
      autoConnect: true,
      reconnection: true,
      reconnectionDelayMax: 5000,
    })
    socketRef.current = socket

    const onConnect = () => {
      void refreshUnread()
    }
    const onNotif = (row: NotificationRow) => {
      setUnread((c) => c + 1)
      setItems((prev) => {
        if (prev.some((p) => p.id === row.id)) return prev
        return [row, ...prev]
      })
    }
    socket.on("connect", onConnect)
    socket.on("notification", onNotif)
    return () => {
      socket.off("connect", onConnect)
      socket.off("notification", onNotif)
      socket.disconnect()
      socketRef.current = null
    }
  }, [authLoading, token, employeeId, refreshUnread])

  useEffect(() => {
    if (open) {
      void loadList()
    }
  }, [open, loadList])

  const onMarkRead = async (n: NotificationRow) => {
    if (!token) return
    if (!n.isRead) {
      const res = await apiFetch(
        `/api/notifications/${n.id}/read`,
        { method: "PATCH" },
        token,
      )
      if (res.ok) {
        setUnread((c) => Math.max(0, c - 1))
        setItems((prev) =>
          prev.map((p) => (p.id === n.id ? { ...p, isRead: true } : p)),
        )
      }
    }
    if (n.inquiryId) {
      setOpen(false)
      navigate(`/portal/inquiries/${n.inquiryId}`)
    } else if (n.orderId) {
      setOpen(false)
      navigate(`/portal/orders/${n.orderId}`)
    } else if (n.walkInAuthenticationId) {
      setOpen(false)
      navigate(`/portal/3rd-party-authentication/${n.walkInAuthenticationId}`)
    }
  }

  const onMarkAllRead = async () => {
    if (!token) return
    const res = await apiFetch(
      "/api/notifications/read-all",
      { method: "POST" },
      token,
    )
    if (res.ok) {
      setUnread(0)
      setItems((prev) => prev.map((p) => ({ ...p, isRead: true })))
    }
  }

  const onClearAll = async () => {
    if (!token) return
    setClearAllError(null)
    setClearAllBusy(true)
    try {
      const res = await apiFetch(
        "/api/notifications",
        { method: "DELETE" },
        token,
      )
      if (!res.ok) {
        setClearAllError("Could not clear notifications")
        return
      }
      setItems([])
      setUnread(0)
      setClearAllOpen(false)
    } catch {
      setClearAllError("Could not clear notifications")
    } finally {
      setClearAllBusy(false)
    }
  }

  if (authLoading || !token || !user?.employee) {
    return null
  }

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-violet-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-violet-300"
          title="Notifications"
          aria-label="Notifications"
        >
          <BellIcon className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[0.6rem] font-bold leading-none text-white dark:bg-rose-500">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </div>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-40"
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
          >
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/30 dark:bg-slate-950/50"
              aria-label="Close notifications"
              onClick={() => setOpen(false)}
            />
            <div className="absolute right-0 top-0 z-50 flex h-svh w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Notifications
                </h2>
                <div className="flex items-center gap-2">
                  {items.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setClearAllError(null)
                        setClearAllOpen(true)
                      }}
                      className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                    >
                      Clear all
                    </button>
                  )}
                  {unread > 0 && (
                    <button
                      type="button"
                      onClick={onMarkAllRead}
                      className="text-xs font-medium text-violet-600 hover:underline dark:text-violet-400"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    aria-label="Close"
                  >
                    <span className="text-lg leading-none">×</span>
                  </button>
                </div>
              </div>
              <div className="app-themed-scrollbar min-h-0 flex-1 overflow-y-auto">
                {panelLoading && items.length === 0 && (
                  <p className="p-4 text-sm text-slate-500">Loading…</p>
                )}
                {listError && (
                  <p className="p-4 text-sm text-rose-600 dark:text-rose-400">
                    {listError}
                  </p>
                )}
                {!panelLoading && items.length === 0 && !listError && (
                  <p className="p-4 text-sm text-slate-500">No notifications yet.</p>
                )}
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => onMarkRead(n)}
                        className={[
                          "w-full px-4 py-3 text-left text-sm transition-colors",
                          n.isRead
                            ? "bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200"
                            : "bg-violet-50/80 font-medium text-slate-900 dark:bg-violet-950/30 dark:text-slate-50",
                          "hover:bg-slate-50 dark:hover:bg-slate-800/80",
                        ].join(" ")}
                      >
                        <p className="whitespace-pre-wrap break-words leading-snug">
                          {n.message}
                        </p>
                        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                          {formatDistanceToNow(new Date(n.createdAt), {
                            addSuffix: true,
                          })}
                        </p>
                        {n.inquiryId && (
                          <p className="mt-0.5 text-xs text-violet-600 dark:text-violet-400">
                            {n.isRead ? "View inquiry" : "Open inquiry (marks read)"}
                          </p>
                        )}
                        {!n.inquiryId && n.orderId && (
                          <p className="mt-0.5 text-xs text-violet-600 dark:text-violet-400">
                            {n.isRead ? "View order" : "Open order (marks read)"}
                          </p>
                        )}
                        {!n.inquiryId && !n.orderId && n.walkInAuthenticationId && (
                          <p className="mt-0.5 text-xs text-violet-600 dark:text-violet-400">
                            {n.isRead
                              ? "View 3rd-party authentication"
                              : "Open 3rd-party authentication (marks read)"}
                          </p>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>,
          document.body,
        )}

      <ConfirmDialog
        open={clearAllOpen}
        title="Clear all notifications?"
        description="This will permanently delete all your notifications. This cannot be undone."
        cancelLabel="Cancel"
        confirmLabel="Clear all"
        danger
        busy={clearAllBusy}
        errorMessage={clearAllError}
        onCancel={() => {
          if (!clearAllBusy) {
            setClearAllOpen(false)
            setClearAllError(null)
          }
        }}
        onConfirm={onClearAll}
      />
    </>
  )
}
