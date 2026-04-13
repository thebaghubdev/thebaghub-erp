import { useClientAuth } from '../context/client-auth'

export function ClientMyAccountPage() {
  const { user } = useClientAuth()
  const c = user?.client

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <dl className="space-y-3 text-sm">
          {c && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Name
              </dt>
              <dd className="mt-0.5 text-slate-900">
                {c.firstName} {c.lastName}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Email
            </dt>
            <dd className="mt-0.5 break-all font-medium text-slate-900">
              {c?.email ?? user?.username}
            </dd>
            <p className="mt-1 text-xs text-slate-500">
              Used to sign in (your account username).
            </p>
          </div>
        </dl>
      </div>
    </div>
  )
}
