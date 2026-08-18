import { Outlet, useLocation } from "react-router-dom";
import { usePortalAuth } from "../context/portal-auth";
import { Breadcrumb } from "./Breadcrumb";
import { MessagingButton } from "./MessagingButton";
import { NotificationBell } from "./NotificationBell";
import { Sidenav } from "./Sidenav";

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
  const { pathname } = useLocation();
  const isMessaging = pathname === "/portal/messaging";

  return (
    <div className="flex h-svh min-h-0 overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidenav />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-white/90 dark:border-slate-800 dark:bg-slate-900/95 dark:supports-[backdrop-filter]:bg-slate-900/90">
          <Breadcrumb />
          <div className="flex min-w-0 shrink items-center gap-3">
            <HeaderUser />
            <MessagingButton />
            <NotificationBell />
          </div>
        </header>
        <main
          className={
            isMessaging
              ? "min-h-0 min-w-0 flex-1 overflow-hidden"
              : "app-themed-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4"
          }
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
