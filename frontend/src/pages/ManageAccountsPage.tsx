import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { HireDatePicker } from '../components/HireDatePicker'
import { TablePaginationBar } from '../components/TablePaginationBar'
import { usePortalAuth } from '../context/portal-auth'
import { apiFetch } from '../lib/api'
import { useClientPagination } from '../hooks/useClientPagination'

/** Matches backend `POSITIONS_KEY` / seeded setting `positions`. */
const POSITIONS_SETTING_KEY = 'positions'

type SettingApiRow = {
  key: string
  type: string
  value: string
}

function parsePositionsFromSettings(settings: SettingApiRow[]): string[] {
  const row = settings.find((s) => s.key === POSITIONS_SETTING_KEY)
  if (!row || row.type !== 'string[]') return []
  try {
    const v = JSON.parse(row.value) as unknown
    if (!Array.isArray(v)) return []
    if (!v.every((x) => typeof x === 'string')) return []
    return v
  } catch {
    return []
  }
}

type EmployeeRow = {
  id: string
  userId: string
  username: string
  isAdmin: boolean
  firstName: string
  lastName: string
  email: string
  contactNumber: string
  hireDate: string
  position: string
  createdAt: string
}

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

type Tab = 'employees' | 'clients'

const tabBtn =
  '-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500'

const field =
  'box-border h-10 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-0 text-sm leading-5 text-slate-900 outline-none ring-violet-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100'

export function ManageAccountsPage() {
  const { token } = usePortalAuth()
  const [tab, setTab] = useState<Tab>('employees')
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [positions, setPositions] = useState<string[]>([])
  const [positionsLoading, setPositionsLoading] = useState(true)
  const [positionsError, setPositionsError] = useState<string | null>(null)

  const [editRow, setEditRow] = useState<EmployeeRow | null>(null)
  const [efFirst, setEfFirst] = useState('')
  const [efLast, setEfLast] = useState('')
  const [efEmail, setEfEmail] = useState('')
  const [efContact, setEfContact] = useState('')
  const [efHire, setEfHire] = useState('')
  const [efPosition, setEfPosition] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  const employeesPagination = useClientPagination(employees)
  const clientsPagination = useClientPagination(clients)

  const positionOptions = useMemo(() => {
    const set = new Set(positions)
    if (efPosition) set.add(efPosition)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [positions, efPosition])

  useEffect(() => {
    if (!token) {
      setPositionsLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setPositionsError(null)
      setPositionsLoading(true)
      try {
        const res = await apiFetch('/api/settings', {}, token)
        if (!res.ok) throw new Error(`Could not load positions (${res.status})`)
        const data = (await res.json()) as SettingApiRow[]
        if (cancelled) return
        setPositions(parsePositionsFromSettings(data))
      } catch (e) {
        if (!cancelled) {
          setPositionsError(
            e instanceof Error ? e.message : 'Failed to load positions',
          )
          setPositions([])
        }
      } finally {
        if (!cancelled) setPositionsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  function openEdit(row: EmployeeRow) {
    if (row.isAdmin) return
    setEditError(null)
    setEditRow(row)
    setEfFirst(row.firstName)
    setEfLast(row.lastName)
    setEfEmail(row.email)
    setEfContact(row.contactNumber)
    setEfHire(row.hireDate)
    setEfPosition(row.position)
  }

  function closeEdit() {
    setEditRow(null)
    setEditError(null)
  }

  const loadEmployees = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await apiFetch('/api/accounts/employees', {}, token)
      if (res.status === 403) {
        throw new Error('Administrator access required.')
      }
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const data = (await res.json()) as EmployeeRow[]
      setEmployees(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load employees')
    } finally {
      setLoading(false)
    }
  }, [token])

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

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editRow || !token) return
    setEditError(null)
    if (!efHire.trim()) {
      setEditError('Please select a hire date.')
      return
    }
    setEditSaving(true)
    try {
      const res = await apiFetch(
        `/api/accounts/employees/${editRow.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            firstName: efFirst.trim(),
            lastName: efLast.trim(),
            email: efEmail.trim(),
            contactNumber: efContact.trim(),
            hireDate: efHire,
            position: efPosition.trim(),
          }),
        },
        token,
      )
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        const msg = Array.isArray(body?.message)
          ? body.message.join(', ')
          : typeof body?.message === 'string'
            ? body.message
            : `Request failed (${res.status})`
        throw new Error(msg)
      }
      closeEdit()
      void loadEmployees()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setEditSaving(false)
    }
  }

  useEffect(() => {
    if (tab === 'employees') void loadEmployees()
    else void loadClients()
  }, [tab, loadEmployees, loadClients])

  return (
    <div className="w-full min-w-0">
      <div
        className="mb-6 flex gap-2 border-b border-slate-200 dark:border-slate-800"
        role="tablist"
        aria-label="Account types"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'employees'}
          id="tab-employees"
          aria-controls="panel-employees"
          className={`${tabBtn} ${
            tab === 'employees'
              ? 'border-b-2 border-violet-600 text-violet-700 dark:text-violet-300'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
          }`}
          onClick={() => setTab('employees')}
        >
          Employees
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'clients'}
          id="tab-clients"
          aria-controls="panel-clients"
          className={`${tabBtn} ${
            tab === 'clients'
              ? 'border-violet-600 text-violet-700 dark:text-violet-300'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
          }`}
          onClick={() => setTab('clients')}
        >
          Clients
        </button>
      </div>

      {tab === 'employees' && (
        <section id="panel-employees" role="tabpanel" aria-labelledby="tab-employees">
          {error && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          )}

          <div className="mb-4 flex justify-end">
            <Link
              to="/portal/accounts/register"
              className="inline-flex items-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              Register
            </Link>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 bg-slate-50/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-950/40 sm:px-4">
              <TablePaginationBar
                totalCount={employeesPagination.totalCount}
                pageIndex={employeesPagination.pageIndex}
                pageSize={employeesPagination.pageSize}
                onPageIndexChange={employeesPagination.setPageIndex}
                onPageSizeChange={employeesPagination.setPageSize}
                disabled={loading && employees.length === 0}
                itemLabel="accounts"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Username
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Name
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Email
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Contact
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Position
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Hire date
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {loading && employees.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-slate-500"
                      >
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!loading && employees.length === 0 && !error && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-slate-500"
                      >
                        No employee accounts yet.
                      </td>
                    </tr>
                  )}
                  {employeesPagination.pageItems.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                        {row.username}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {row.firstName} {row.lastName}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        {row.email}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-400">
                        {row.contactNumber}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        {row.position}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-400">
                        {row.hireDate}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {row.isAdmin ? (
                          <span
                            className="text-xs text-slate-400 dark:text-slate-500"
                            title="Administrator accounts cannot be edited here"
                          >
                            —
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {tab === 'clients' && (
        <section id="panel-clients" role="tabpanel" aria-labelledby="tab-clients">
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
                itemLabel="accounts"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Username
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Name
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Email
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Contact
                    </th>
                    <th scope="col" className="px-4 py-3">
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
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                        {row.username}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {row.firstName} {row.lastName}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        {row.email}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-400">
                        {row.contactNumber}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-400">
                        {new Date(row.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {editRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal
          aria-labelledby="edit-employee-title"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h3
              id="edit-employee-title"
              className="mb-1 text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Edit employee
            </h3>
            <p className="mb-4 font-mono text-xs text-slate-500 dark:text-slate-400">
              {editRow.username}
            </p>

            <form onSubmit={submitEdit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium" htmlFor="edit-first">
                    First name
                  </label>
                  <input
                    id="edit-first"
                    className={field}
                    value={efFirst}
                    onChange={(e) => setEfFirst(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" htmlFor="edit-last">
                    Last name
                  </label>
                  <input
                    id="edit-last"
                    className={field}
                    value={efLast}
                    onChange={(e) => setEfLast(e.target.value)}
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium" htmlFor="edit-email">
                    Email
                  </label>
                  <input
                    id="edit-email"
                    type="email"
                    className={field}
                    value={efEmail}
                    onChange={(e) => setEfEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium" htmlFor="edit-contact">
                    Contact number
                  </label>
                  <input
                    id="edit-contact"
                    className={field}
                    value={efContact}
                    onChange={(e) => setEfContact(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" htmlFor="edit-hire">
                    Hire date
                  </label>
                  <HireDatePicker
                    id="edit-hire"
                    value={efHire}
                    onChange={setEfHire}
                    triggerClassName={field}
                    disabled={editSaving}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" htmlFor="edit-position">
                    Position
                  </label>
                  <select
                    id="edit-position"
                    className={field}
                    value={efPosition}
                    onChange={(e) => setEfPosition(e.target.value)}
                    required
                    disabled={
                      editSaving ||
                      positionsLoading ||
                      (!positionsLoading && positionOptions.length === 0)
                    }
                  >
                    <option value="" disabled>
                      {positionsLoading
                        ? 'Loading positions…'
                        : positionOptions.length === 0
                          ? 'No positions available'
                          : 'Select position'}
                    </option>
                    {positionOptions.map((title) => (
                      <option key={title} value={title}>
                        {title}
                      </option>
                    ))}
                  </select>
                  {positionsError && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {positionsError}
                    </p>
                  )}
                </div>
              </div>

              {editError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                  {editError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeEdit}
                  disabled={editSaving}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    editSaving ||
                    positionsLoading ||
                    (!positionsLoading && positionOptions.length === 0)
                  }
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
                >
                  {editSaving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
