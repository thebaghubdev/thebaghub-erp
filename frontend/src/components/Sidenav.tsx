import { NavLink } from "react-router-dom";
import { usePortalAuth } from "../context/portal-auth";
import {
  PORTAL_NAV_ITEMS,
  canViewFeature,
} from "../lib/feature-access";

const linkClass =
  "block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800";

const activeClass =
  "bg-violet-100 text-violet-900 dark:bg-violet-950/60 dark:text-violet-100";

export function Sidenav() {
  const { user, logout, featureAccess, featureAccessLoading } = usePortalAuth();

  const visibleItems = PORTAL_NAV_ITEMS.filter(
    (item) =>
      item.alwaysVisible ||
      (!featureAccessLoading &&
        canViewFeature(user?.isAdmin, featureAccess, item.key)),
  );

  return (
    <aside className="flex h-full min-h-0 w-56 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-3 py-4 dark:border-slate-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          The Bag Hub ERP
        </p>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2" aria-label="Main">
        {visibleItems.map((item) => (
          <NavLink
            key={item.key}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              [linkClass, isActive ? activeClass : ""].join(" ")
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-2 dark:border-slate-800">
        <p
          className="mb-2 truncate px-2 text-xs text-slate-500"
          title={user?.username}
        >
          {user?.username}
        </p>
        <button
          type="button"
          onClick={() => logout()}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
        >
          Log out
        </button>
      </div>
    </aside>
  );
}
