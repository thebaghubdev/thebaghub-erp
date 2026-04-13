import { NavLink, Outlet } from 'react-router-dom'
import { useClientAuth } from '../context/client-auth'

const navLinkClass =
  'flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 transition-colors sm:min-h-14 sm:text-sm'

const navActiveClass = 'bg-violet-100 text-violet-900'

export function ClientLayout() {
  const { user, logout } = useClientAuth()
  const name = user?.client
    ? `${user.client.firstName} ${user.client.lastName}`
    : user?.username

  return (
    <div className="flex min-h-svh flex-col bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold text-slate-900">
            {name ?? 'Client'}
          </p>
          <button
            type="button"
            onClick={() => logout()}
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto px-4 pb-28 pt-4">
        <div className="mx-auto max-w-lg">
          <Outlet />
        </div>
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-10 border-t border-slate-200 bg-white pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]"
        aria-label="Client menu"
      >
        <div className="mx-auto flex max-w-lg justify-around gap-1 px-2">
          <NavLink
            to="/consign-items"
            className={({ isActive }) =>
              [navLinkClass, isActive ? navActiveClass : 'hover:bg-slate-100'].join(
                ' ',
              )
            }
          >
            Consign items
          </NavLink>
          <NavLink
            to="/purchase-items"
            className={({ isActive }) =>
              [navLinkClass, isActive ? navActiveClass : 'hover:bg-slate-100'].join(
                ' ',
              )
            }
          >
            Purchase items
          </NavLink>
          <NavLink
            to="/my-account"
            className={({ isActive }) =>
              [navLinkClass, isActive ? navActiveClass : 'hover:bg-slate-100'].join(
                ' ',
              )
            }
          >
            My account
          </NavLink>
        </div>
      </nav>
    </div>
  )
}
