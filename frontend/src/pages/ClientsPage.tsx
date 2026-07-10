import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HorizontalScrollMirror } from '../components/HorizontalScrollMirror'
import { TablePaginationBar } from '../components/TablePaginationBar'
import { usePortalAuth } from '../context/portal-auth'
import { apiFetch } from '../lib/api'
import { useClientPagination } from '../hooks/useClientPagination'

type ClientRow = {
  id: string
  userId: string
  username: string
  firstName: string
  lastName: string
  email: string
  contactNumber: string
  createdAt: string
}

export function ClientsPage() {
  const { token } = usePortalAuth()
  const navigate = useNavigate()
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clientsPagination = useClientPagination(clients)

  const loadClients = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await apiFetch('/api/accounts/clients', {}, token)
      if (res.status === 403) {
        throw new Error('Administrator access required.')
      }
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const data = (await res.json()) as ClientRow[]
      setClients(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load clients')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadClients()
  }, [loadClients])

  return (
    <div className="w-full min-w-0">
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 bg-slate-50/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-950/40 sm:px-4">
          <TablePaginationBar
            totalCount={clientsPagination.totalCount}
            pageIndex={clientsPagination.pageIndex}
            pageSize={clientsPagination.pageSize}
            onPageIndexChange={clientsPagination.setPageIndex}
            onPageSizeChange={clientsPagination.setPageSize}
            disabled={loading && clients.length === 0}
            itemLabel="clients"
          />
        </div>
        <HorizontalScrollMirror>
          <table className="w-max min-w-full border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
              <tr>
                <th scope="col" className="max-w-[10rem] min-w-0 px-4 py-3">
                  Username
                </th>
                <th scope="col" className="max-w-[10rem] min-w-0 px-4 py-3">
                  Name
                </th>
                <th scope="col" className="max-w-[10rem] min-w-0 px-4 py-3">
                  Email
                </th>
                <th scope="col" className="max-w-[10rem] min-w-0 px-4 py-3">
                  Contact
                </th>
                <th scope="col" className="max-w-[10rem] min-w-0 px-4 py-3">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading && clients.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && clients.length === 0 && !error && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No client accounts yet.
                  </td>
                </tr>
              )}
              {clientsPagination.pageItems.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  onClick={() => navigate(`/portal/clients/${row.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate(`/portal/clients/${row.id}`)
                    }
                  }}
                  tabIndex={0}
                  role="link"
                  aria-label={`View client ${row.firstName} ${row.lastName}`}
                >
                  <td className="max-w-[10rem] min-w-0 truncate px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                    {row.username}
                  </td>
                  <td className="max-w-[10rem] min-w-0 break-words px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                    {row.firstName} {row.lastName}
                  </td>
                  <td className="max-w-[10rem] min-w-0 break-words px-4 py-3 text-slate-700 dark:text-slate-300">
                    {row.email}
                  </td>
                  <td className="max-w-[10rem] min-w-0 truncate px-4 py-3 text-slate-600 dark:text-slate-400">
                    {row.contactNumber}
                  </td>
                  <td className="max-w-[10rem] min-w-0 truncate px-4 py-3 text-slate-600 dark:text-slate-400">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </HorizontalScrollMirror>
      </div>
    </div>
  )
}
