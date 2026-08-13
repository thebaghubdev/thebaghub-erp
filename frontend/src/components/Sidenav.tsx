import { NavLink } from "react-router-dom";
import { usePortalAuth } from "../context/portal-auth";

const linkClass =
  "block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800";

const activeClass =
  "bg-violet-100 text-violet-900 dark:bg-violet-950/60 dark:text-violet-100";

export function Sidenav() {
  const { user, logout } = usePortalAuth();

  return (
    <aside className="flex h-full min-h-0 w-56 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-3 py-4 dark:border-slate-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          The Bag Hub ERP
        </p>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-2" aria-label="Main">
        <NavLink
          to="/portal/dashboards"
          end
          className={({ isActive }) =>
            [linkClass, isActive ? activeClass : ""].join(" ")
          }
        >
          Dashboards
        </NavLink>
        <NavLink
          to="/portal/inventory"
          className={({ isActive }) =>
            [linkClass, isActive ? activeClass : ""].join(" ")
          }
        >
          Inventory
        </NavLink>
        <NavLink
          to="/portal/inquiries"
          className={({ isActive }) =>
            [linkClass, isActive ? activeClass : ""].join(" ")
          }
        >
          Consignment Inquiries
        </NavLink>
        <NavLink
          to="/portal/consignment-scheduling"
          className={({ isActive }) =>
            [linkClass, isActive ? activeClass : ""].join(" ")
          }
        >
          Consignment Scheduling
        </NavLink>
        <NavLink
          to="/portal/authentication"
          className={({ isActive }) =>
            [linkClass, isActive ? activeClass : ""].join(" ")
          }
        >
          Authentication
        </NavLink>
        <NavLink
          to="/portal/photoshoot"
          className={({ isActive }) =>
            [linkClass, isActive ? activeClass : ""].join(" ")
          }
        >
          Photoshoot
        </NavLink>
        <NavLink
          to="/portal/pricing"
          end
          className={({ isActive }) =>
            [linkClass, isActive ? activeClass : ""].join(" ")
          }
        >
          Pricing
        </NavLink>
        <NavLink
          to="/portal/editing"
          end
          className={({ isActive }) =>
            [linkClass, isActive ? activeClass : ""].join(" ")
          }
        >
          Editing
        </NavLink>
        <NavLink
          to="/portal/posting"
          end
          className={({ isActive }) =>
            [linkClass, isActive ? activeClass : ""].join(" ")
          }
        >
          Posting
        </NavLink>
        <NavLink
          to="/portal/orders"
          end
          className={({ isActive }) =>
            [linkClass, isActive ? activeClass : ""].join(" ")
          }
        >
          Orders
        </NavLink>
        <NavLink
          to="/portal/consignor-payments"
          end
          className={({ isActive }) =>
            [linkClass, isActive ? activeClass : ""].join(" ")
          }
        >
          Consignor Payments
        </NavLink>
        <NavLink
          to="/portal/walk-in-authentication"
          className={({ isActive }) =>
            [linkClass, isActive ? activeClass : ""].join(" ")
          }
        >
          Walk-in Authentication
        </NavLink>
        <NavLink
          to="/portal/promotions"
          end
          className={({ isActive }) =>
            [linkClass, isActive ? activeClass : ""].join(" ")
          }
        >
          Promotions
        </NavLink>
        <NavLink
          to="/portal/vouchers"
          end
          className={({ isActive }) =>
            [linkClass, isActive ? activeClass : ""].join(" ")
          }
        >
          Credit Vouchers
        </NavLink>
        <NavLink
          to="/portal/logistics"
          end
          className={({ isActive }) =>
            [linkClass, isActive ? activeClass : ""].join(" ")
          }
        >
          Logistics
        </NavLink>
        <NavLink
          to="/portal/employees"
          className={({ isActive }) =>
            [linkClass, isActive ? activeClass : ""].join(" ")
          }
        >
          Employees
        </NavLink>
        <NavLink
          to="/portal/clients"
          className={({ isActive }) =>
            [linkClass, isActive ? activeClass : ""].join(" ")
          }
        >
          Clients
        </NavLink>
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
