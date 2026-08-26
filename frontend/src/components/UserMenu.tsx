import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useApp } from "../context/useApp";
import { usePortalAuth } from "../context/portal-auth";
import { ConfirmDialog } from "./ConfirmDialog";

function UserCircleIcon({ className }: { className?: string }) {
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
        d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

const iconButtonClass =
  "relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border shadow-sm transition-colors";

const iconButtonIdleClass =
  "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-violet-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-violet-300";

const iconButtonActiveClass =
  "border-violet-400 bg-violet-50 text-violet-700 dark:border-violet-500 dark:bg-violet-950/50 dark:text-violet-300";

export function UserMenu() {
  const { logout } = usePortalAuth();
  const { theme, toggleTheme } = useApp();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const darkMode = theme === "dark";
  const isProfile = pathname === "/portal/profile";
  const buttonActive = open || isProfile;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <div className="relative shrink-0" ref={menuRef}>
        <button
          type="button"
          title="Account menu"
          aria-label="Account menu"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((v) => !v)}
          className={[
            iconButtonClass,
            buttonActive ? iconButtonActiveClass : iconButtonIdleClass,
          ].join(" ")}
        >
          <UserCircleIcon className="h-5 w-5" />
        </button>
        {open ? (
          <ul
            role="menu"
            aria-label="Account"
            className="absolute right-0 top-full z-50 mt-1 min-w-[13.5rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
          >
            <li role="none">
              <Link
                to="/portal/profile"
                role="menuitem"
                className="block px-3 py-2 text-sm text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800"
                onClick={() => setOpen(false)}
              >
                View profile
              </Link>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={darkMode}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800"
                onClick={() => toggleTheme()}
              >
                <span>Dark mode</span>
                <span
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                    darkMode ? "bg-violet-600" : "bg-slate-300 dark:bg-slate-600"
                  }`}
                  aria-hidden
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      darkMode ? "translate-x-[1.125rem]" : "translate-x-0.5"
                    }`}
                  />
                </span>
              </button>
            </li>
            <li
              role="separator"
              className="my-1 border-t border-slate-200 dark:border-slate-700"
            />
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800"
                onClick={() => {
                  setOpen(false);
                  setLogoutOpen(true);
                }}
              >
                Logout
              </button>
            </li>
          </ul>
        ) : null}
      </div>
      <ConfirmDialog
        open={logoutOpen}
        title="Log out?"
        description="You will need to sign in again to use the staff portal."
        confirmLabel="Log out"
        danger
        onCancel={() => setLogoutOpen(false)}
        onConfirm={() => {
          setLogoutOpen(false);
          logout();
        }}
      />
    </>
  );
}
