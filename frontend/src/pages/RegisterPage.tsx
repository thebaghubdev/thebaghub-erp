import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { HireDatePicker } from '../components/HireDatePicker'
import { useAuth } from '../context/useAuth'
import { apiFetch } from '../lib/api'

const JOB_TITLES_SETTING_KEY = 'jobTitles'

type SettingApiRow = {
  key: string
  type: string
  value: string
}

function parseJobTitlesFromSettings(settings: SettingApiRow[]): string[] {
  const row = settings.find((s) => s.key === JOB_TITLES_SETTING_KEY)
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

export function RegisterPage() {
  const { token, user } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [contactNumber, setContactNumber] = useState('')
  const [hireDate, setHireDate] = useState('')
  const [position, setPosition] = useState('')
  const [jobTitles, setJobTitles] = useState<string[]>([])
  const [jobTitlesLoading, setJobTitlesLoading] = useState(true)
  const [jobTitlesError, setJobTitlesError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!user?.isAdmin || !token) {
      setJobTitlesLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setJobTitlesError(null)
      setJobTitlesLoading(true)
      try {
        const res = await apiFetch('/api/settings', {}, token)
        if (!res.ok) throw new Error(`Could not load job titles (${res.status})`)
        const data = (await res.json()) as SettingApiRow[]
        if (cancelled) return
        setJobTitles(parseJobTitlesFromSettings(data))
      } catch (e) {
        if (!cancelled) {
          setJobTitlesError(
            e instanceof Error ? e.message : 'Failed to load job titles',
          )
          setJobTitles([])
        }
      } finally {
        if (!cancelled) setJobTitlesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.isAdmin, token])

  if (!user?.isAdmin) {
    return <Navigate to="/" replace />
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    if (!hireDate.trim()) {
      setError('Please select a hire date.')
      return
    }
    setSubmitting(true)
    try {
      const res = await apiFetch(
        '/api/auth/register/employee',
        {
          method: 'POST',
          body: JSON.stringify({
            username: username.trim(),
            password,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim(),
            contactNumber: contactNumber.trim(),
            hireDate,
            position: position.trim(),
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
      setSuccess(`Created user "${body.username}" and employee record.`)
      setUsername('')
      setPassword('')
      setFirstName('')
      setLastName('')
      setEmail('')
      setContactNumber('')
      setHireDate('')
      setPosition('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setSubmitting(false)
    }
  }

  const field =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-violet-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100'

  return (
    <div className="w-full min-w-0">
      <h2 className="mb-2 text-lg font-semibold tracking-tight">
        Register employee
      </h2>
      <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
        Creates a new user (employee) and linked employee profile.
      </p>

      <form
        onSubmit={onSubmit}
        className="max-w-xl space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium" htmlFor="reg-username">
              Username
            </label>
            <input
              id="reg-username"
              className={field}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium" htmlFor="reg-password">
              Password
            </label>
            <input
              id="reg-password"
              type="password"
              className={field}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" htmlFor="reg-fn">
              First name
            </label>
            <input
              id="reg-fn"
              className={field}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" htmlFor="reg-ln">
              Last name
            </label>
            <input
              id="reg-ln"
              className={field}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium" htmlFor="reg-email">
              Email
            </label>
            <input
              id="reg-email"
              type="email"
              className={field}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium" htmlFor="reg-contact">
              Contact number
            </label>
            <input
              id="reg-contact"
              className={field}
              value={contactNumber}
              onChange={(e) => setContactNumber(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" htmlFor="reg-hire">
              Hire date
            </label>
            <HireDatePicker
              id="reg-hire"
              value={hireDate}
              onChange={setHireDate}
              triggerClassName={field}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" htmlFor="reg-position">
              Position
            </label>
            <select
              id="reg-position"
              className={field}
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              required
              disabled={jobTitlesLoading || jobTitles.length === 0}
            >
              <option value="" disabled>
                {jobTitlesLoading
                  ? 'Loading positions…'
                  : jobTitles.length === 0
                    ? 'No positions available'
                    : 'Select position'}
              </option>
              {jobTitles.map((title) => (
                <option key={title} value={title}>
                  {title}
                </option>
              ))}
            </select>
            {jobTitlesError && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {jobTitlesError}
              </p>
            )}
            {!jobTitlesLoading &&
              !jobTitlesError &&
              jobTitles.length === 0 && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Add job titles under Settings (User Management) or ask an administrator.
                </p>
              )}
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={
            submitting ||
            jobTitlesLoading ||
            (!jobTitlesLoading && jobTitles.length === 0)
          }
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Create employee'}
        </button>
      </form>
    </div>
  )
}
