import { Link, useLocation } from "react-router-dom";

const pathLabels: Record<string, string> = {
  '/': 'Home',
  '/inquiry': 'Inquiry',
  '/settings': 'Settings',
  '/register': 'Register',
}

type Crumb = { label: string; to: string; current: boolean };

function crumbsForPath(pathname: string): Crumb[] {
  const normalized = pathname === "" ? "/" : pathname;
  const out: Crumb[] = [];

  out.push({
    label: pathLabels["/"] ?? "Home",
    to: "/",
    current: normalized === "/",
  });

  if (normalized !== "/") {
    const label = pathLabels[normalized];
    if (label) {
      out.push({
        label,
        to: normalized,
        current: true,
      });
    }
  }

  return out;
}

export function Breadcrumb() {
  const { pathname } = useLocation();
  const crumbs = crumbsForPath(pathname);

  return (
    <nav
      aria-label="Breadcrumb"
      className="text-sm text-slate-600 dark:text-slate-400"
    >
      <ol className="flex flex-wrap items-center gap-1.5">
        {crumbs.map((crumb, i) => (
          <li key={`${crumb.to}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && (
              <span className="text-slate-400 dark:text-slate-600" aria-hidden>
                /
              </span>
            )}
            {crumb.current ? (
              <span
                className="font-medium text-slate-900 dark:text-slate-100"
                aria-current="page"
              >
                {crumb.label}
              </span>
            ) : (
              <Link
                to={crumb.to}
                className="hover:text-violet-700 dark:hover:text-violet-300"
              >
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
