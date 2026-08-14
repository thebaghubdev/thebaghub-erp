import { Link, useLocation } from "react-router-dom";

const pathLabels: Record<string, string> = {
  "/portal/taskboard": "Taskboard",
  "/portal/dashboards": "Dashboards",
  "/portal/inquiries": "Consignment Inquiries",
  "/portal/consignment-scheduling": "Consignment Scheduling",
  "/portal/inventory": "Inventory",
  "/portal/authentication": "Authentication",
  "/portal/walk-in-authentication": "Walk-in Authentication",
  "/portal/photoshoot": "Photoshoot",
  "/portal/pricing": "Pricing",
  "/portal/editing": "Editing",
  "/portal/posting": "Posting",
  "/portal/orders": "Orders",
  "/portal/consignor-payments": "Consignor Payments",
  "/portal/promotions": "Promotions",
  "/portal/vouchers": "Credit Vouchers",
  "/portal/logistics": "Logistics",
  "/portal/settings": "Settings",
  "/portal/access-management": "Access Management",
  "/portal/employees": "Employees",
  "/portal/employees/register": "Register",
  "/portal/clients": "Clients",
};

type Crumb = { label: string; to: string; current: boolean };

function crumbsForPath(pathname: string): Crumb[] {
  const normalized = pathname === "" ? "/" : pathname;
  const out: Crumb[] = [];

  if (normalized === "/portal/employees/register") {
    out.push(
      {
        label: pathLabels["/portal/employees"] ?? "Employees",
        to: "/portal/employees",
        current: false,
      },
      {
        label: pathLabels["/portal/employees/register"] ?? "Register",
        to: normalized,
        current: true,
      },
    );
    return out;
  }

  if (
    /^\/portal\/clients\/[^/]+$/.test(normalized) &&
    normalized !== "/portal/clients"
  ) {
    return [
      {
        label: pathLabels["/portal/clients"] ?? "Clients",
        to: "/portal/clients",
        current: false,
      },
      { label: "Client details", to: normalized, current: true },
    ];
  }

  const label = pathLabels[normalized];
  if (label) {
    return [{ label, to: normalized, current: true }];
  }

  if (
    /^\/portal\/inquiries\/.+/.test(normalized) &&
    normalized !== "/portal/inquiries"
  ) {
    return [
      {
        label: pathLabels["/portal/inquiries"] ?? "Consignment Inquiries",
        to: "/portal/inquiries",
        current: false,
      },
      { label: "Inquiry details", to: normalized, current: true },
    ];
  }

  if (
    /^\/portal\/consignment-scheduling\/.+/.test(normalized) &&
    normalized !== "/portal/consignment-scheduling"
  ) {
    return [
      {
        label:
          pathLabels["/portal/consignment-scheduling"] ??
          "Consignment Scheduling",
        to: "/portal/consignment-scheduling",
        current: false,
      },
      { label: "Schedule details", to: normalized, current: true },
    ];
  }

  if (
    /^\/portal\/consignor-payments\/.+/.test(normalized) &&
    normalized !== "/portal/consignor-payments"
  ) {
    return [
      {
        label: pathLabels["/portal/consignor-payments"] ?? "Consignor Payments",
        to: "/portal/consignor-payments",
        current: false,
      },
      { label: "Payment batch details", to: normalized, current: true },
    ];
  }

  const inventoryAuthSuffix = /^\/portal\/inventory\/([^/]+)\/authentication$/;
  const mInventoryAuth = inventoryAuthSuffix.exec(normalized);
  if (mInventoryAuth) {
    const itemId = mInventoryAuth[1];
    const itemBase = `/portal/inventory/${itemId}`;
    return [
      {
        label: pathLabels["/portal/inventory"] ?? "Inventory",
        to: "/portal/inventory",
        current: false,
      },
      {
        label: "Item details",
        to: itemBase,
        current: false,
      },
      {
        label: "Authentication results",
        to: normalized,
        current: true,
      },
    ];
  }

  if (
    /^\/portal\/inventory\/.+/.test(normalized) &&
    normalized !== "/portal/inventory"
  ) {
    return [
      {
        label: pathLabels["/portal/inventory"] ?? "Inventory",
        to: "/portal/inventory",
        current: false,
      },
      { label: "Item details", to: normalized, current: true },
    ];
  }

  if (
    /^\/portal\/authentication\/.+/.test(normalized) &&
    normalized !== "/portal/authentication"
  ) {
    return [
      {
        label: pathLabels["/portal/authentication"] ?? "Authentication",
        to: "/portal/authentication",
        current: false,
      },
      { label: "Item authentication", to: normalized, current: true },
    ];
  }

  if (
    /^\/portal\/walk-in-authentication\/.+/.test(normalized) &&
    normalized !== "/portal/walk-in-authentication"
  ) {
    return [
      {
        label:
          pathLabels["/portal/walk-in-authentication"] ??
          "Walk-in Authentication",
        to: "/portal/walk-in-authentication",
        current: false,
      },
      { label: "Walk-in auth details", to: normalized, current: true },
    ];
  }

  if (
    /^\/portal\/editing\/[^/]+$/.test(normalized) &&
    normalized !== "/portal/editing"
  ) {
    return [
      {
        label: pathLabels["/portal/editing"] ?? "Editing",
        to: "/portal/editing",
        current: false,
      },
      {
        label: "Item editing",
        to: normalized,
        current: true,
      },
    ];
  }

  if (
    /^\/portal\/posting\/[^/]+$/.test(normalized) &&
    normalized !== "/portal/posting"
  ) {
    return [
      {
        label: pathLabels["/portal/posting"] ?? "Posting",
        to: "/portal/posting",
        current: false,
      },
      {
        label: "Posting item",
        to: normalized,
        current: true,
      },
    ];
  }

  if (
    /^\/portal\/orders\/[^/]+$/.test(normalized) &&
    normalized !== "/portal/orders"
  ) {
    return [
      {
        label: pathLabels["/portal/orders"] ?? "Orders",
        to: "/portal/orders",
        current: false,
      },
      { label: "Order details", to: normalized, current: true },
    ];
  }

  if (
    /^\/portal\/photoshoot\/item\/.+/.test(normalized) &&
    normalized !== "/portal/photoshoot"
  ) {
    return [
      {
        label: pathLabels["/portal/photoshoot"] ?? "Photoshoot",
        to: "/portal/photoshoot",
        current: false,
      },
      { label: "Photoshoot item", to: normalized, current: true },
    ];
  }

  return [];
}

export function Breadcrumb() {
  const { pathname } = useLocation();
  const crumbs = crumbsForPath(pathname);

  if (crumbs.length === 0) {
    return null;
  }

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
