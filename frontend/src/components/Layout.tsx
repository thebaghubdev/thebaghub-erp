import { NavLink, Outlet } from "react-router-dom";
import { usePortalAuth } from "../context/portal-auth";
import { Breadcrumb } from "./Breadcrumb";
import { Sidenav } from "./Sidenav";

function CogIcon({ className }: { className?: string }) {
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
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function SettingsNavButton() {
  return (
    <NavLink
      to="/portal/settings"
      title="Settings"
      aria-label="Settings"
      className={({ isActive }) =>
        [
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border shadow-sm transition-colors",
          "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-violet-700",
          "dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-violet-300",
          isActive
            ? "border-violet-400 bg-violet-50 text-violet-800 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-200"
            : "",
        ].join(" ")
      }
    >
      <CogIcon className="h-5 w-5" />
    </NavLink>
  );
}

function HeaderUser() {
  const { user } = usePortalAuth();
  const emp = user?.employee;

  return (
    <div className="min-w-0 text-right">
      {emp ? (
        <>
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {emp.firstName} {emp.lastName}
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {emp.position}
          </p>
        </>
      ) : (
        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
          {user?.username}
        </p>
      )}
    </div>
  );
}

export function Layout() {
  return (
    <div className="flex h-svh min-h-0 overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidenav />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-white/90 dark:border-slate-800 dark:bg-slate-900/95 dark:supports-[backdrop-filter]:bg-slate-900/90">
          <Breadcrumb />
          <div className="flex min-w-0 shrink items-center gap-3">
            <HeaderUser />
            <SettingsNavButton />
          </div>
        </header>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
