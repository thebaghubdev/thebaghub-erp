import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useClientAuth } from "../context/client-auth";

const navLinkClass =
  "flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 transition-colors sm:min-h-14 sm:text-sm";

const navActiveClass = "bg-violet-100 text-violet-900";

function UserCircleIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.75}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  );
}

export function ClientLayout() {
  const { logout } = useClientAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userMenuOpen) return;

    const onPointerDown = (e: MouseEvent) => {
      if (!userMenuRef.current?.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserMenuOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [userMenuOpen]);

  return (
    <div className="flex min-h-svh flex-col bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold text-slate-900">
            The Bag Hub
          </p>
          <div className="relative shrink-0" ref={userMenuRef}>
            <button
              type="button"
              aria-label="Account menu"
              aria-expanded={userMenuOpen}
              aria-haspopup="menu"
              onClick={() => setUserMenuOpen((open) => !open)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <UserCircleIcon />
            </button>
            {userMenuOpen ? (
              <ul
                role="menu"
                className="absolute right-0 top-full z-50 mt-1 min-w-[10rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
              >
                <li role="none">
                  <Link
                    to="/profile"
                    role="menuitem"
                    className="block px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    My profile
                  </Link>
                </li>
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                    onClick={() => {
                      setUserMenuOpen(false);
                      logout();
                    }}
                  >
                    Log out
                  </button>
                </li>
              </ul>
            ) : null}
          </div>
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
            to="/catalog"
            className={({ isActive }) =>
              [
                navLinkClass,
                isActive ? navActiveClass : "hover:bg-slate-100",
              ].join(" ")
            }
          >
            Catalog
          </NavLink>
          <NavLink
            to="/consignments"
            className={({ isActive }) =>
              [
                navLinkClass,
                isActive ? navActiveClass : "hover:bg-slate-100",
              ].join(" ")
            }
          >
            Consignments
          </NavLink>
          <NavLink
            to="/orders"
            className={({ isActive }) =>
              [
                navLinkClass,
                isActive ? navActiveClass : "hover:bg-slate-100",
              ].join(" ")
            }
          >
            Orders
          </NavLink>
        </div>
      </nav>
    </div>
  );
}
