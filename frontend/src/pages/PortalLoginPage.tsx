import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { PasswordField } from '../components/PasswordField'
import { usePortalAuth } from '../context/portal-auth'

export function PortalLoginPage() {
  const { login, token, user, loading: authLoading } = usePortalAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo =
    (location.state as { from?: string } | undefined)?.from ??
    '/portal/inquiries'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username.trim(), password)
      const target =
        redirectTo.startsWith('/portal') && redirectTo !== '/portal/login'
          ? redirectTo
          : '/portal/inquiries'
      navigate(target, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-slate-50 text-slate-600 dark:bg-slate-950 dark:text-slate-400">
        <p className="text-sm">Loading…</p>
      </div>
    )
  }

  if (user?.userType === 'client') {
    return <Navigate to="/login" replace />
  }

  if (token && user && user.userType !== 'client') {
    return <Navigate to="/portal/inquiries" replace />
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="mb-1 text-center text-lg font-semibold text-slate-900 dark:text-slate-100">
          The Bag Hub ERP
        </h1>
        <p className="mb-6 text-center text-sm text-slate-600 dark:text-slate-400">
          Employee Portal
        </p>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="portal-login-username"
              className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Username
            </label>
            <input
              id="portal-login-username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-violet-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              required
            />
          </div>
          <PasswordField
            id="portal-login-password"
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            required
          />

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
