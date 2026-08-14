import { useLocation, useNavigate } from 'react-router-dom'

export function UnauthorizedPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | undefined)?.from

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        Access denied
      </h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        You do not have permission to view this page. Ask an administrator to
        grant access in Access Management.
      </p>
      <button
        type="button"
        onClick={() => {
          if (window.history.length > 1) {
            navigate(-1)
            return
          }
          if (from && from !== '/portal/unauthorized') {
            navigate(from, { replace: true })
            return
          }
          navigate('/portal/taskboard', { replace: true })
        }}
        className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 dark:bg-violet-600 dark:hover:bg-violet-500"
      >
        Go back
      </button>
    </div>
  )
}
