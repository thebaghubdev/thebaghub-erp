import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HorizontalScrollMirror } from "../components/HorizontalScrollMirror";
import { InventoryStatusBadge } from "../components/InventoryStatusBadge";
import { OrderStatusBadge } from "../components/OrderStatusBadge";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { TablePaginationBar } from "../components/TablePaginationBar";
import { useClientAuth } from "../context/client-auth";
import { useClientPagination } from "../hooks/useClientPagination";
import { apiFetch } from "../lib/api";
import { formatPhpDisplay } from "../lib/format-php";
import { paymentTypeLabel } from "../lib/order-status-filter-options";

type ClientOrdersTab = "orders" | "waitlists" | "appointments";

type MyOrderRow = {
  id: string;
  orderNumber: number;
  status: string;
  itemSku: string;
  itemLabel: string;
  paymentType: string;
  amount: string | null;
  createdAt: string;
};

type MyWaitlistRow = {
  id: string;
  inventoryItemId: string;
  itemSku: string;
  itemLabel: string;
  productName: string;
  status: string;
  price: string | null;
  createdAt: string;
};

const tabBtn =
  "-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 sm:px-4";

export function ClientOrdersPage() {
  const navigate = useNavigate();
  const { token } = useClientAuth();
  const [tab, setTab] = useState<ClientOrdersTab>("orders");
  const [rows, setRows] = useState<MyOrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waitlistRows, setWaitlistRows] = useState<MyWaitlistRow[]>([]);
  const [waitlistsLoading, setWaitlistsLoading] = useState(false);
  const [waitlistsError, setWaitlistsError] = useState<string | null>(null);

  const ordersPagination = useClientPagination(rows);
  const waitlistsPagination = useClientPagination(waitlistRows);

  const loadMyOrders = useCallback(async () => {
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch("/api/client/orders", {}, token);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as MyOrderRow[];
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load your orders");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadMyWaitlists = useCallback(async () => {
    if (!token) return;
    setWaitlistsError(null);
    setWaitlistsLoading(true);
    try {
      const res = await apiFetch("/api/client/orders/waitlists", {}, token);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as MyWaitlistRow[];
      setWaitlistRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setWaitlistsError(
        e instanceof Error ? e.message : "Failed to load your waitlists",
      );
      setWaitlistRows([]);
    } finally {
      setWaitlistsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (tab === "orders") void loadMyOrders();
    if (tab === "waitlists") void loadMyWaitlists();
  }, [tab, loadMyOrders, loadMyWaitlists]);

  return (
    <div className="w-full min-w-0">
      <div
        className="mb-4 flex items-end gap-1 border-b border-slate-200 sm:gap-2"
        role="tablist"
        aria-label="Orders sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "orders"}
          id="tab-client-orders"
          aria-controls="panel-client-orders"
          className={`${tabBtn} ${
            tab === "orders"
              ? "border-violet-600 text-violet-700"
              : "text-slate-600 hover:text-slate-900"
          }`}
          onClick={() => setTab("orders")}
        >
          My orders
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "waitlists"}
          id="tab-client-waitlists"
          aria-controls="panel-client-waitlists"
          className={`${tabBtn} ${
            tab === "waitlists"
              ? "border-violet-600 text-violet-700"
              : "text-slate-600 hover:text-slate-900"
          }`}
          onClick={() => setTab("waitlists")}
        >
          My waitlists
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "appointments"}
          id="tab-client-appointments"
          aria-controls="panel-client-appointments"
          className={`${tabBtn} ${
            tab === "appointments"
              ? "border-violet-600 text-violet-700"
              : "text-slate-600 hover:text-slate-900"
          }`}
          onClick={() => setTab("appointments")}
        >
          My appointments
        </button>
      </div>

      {tab === "orders" && (
        <section
          id="panel-client-orders"
          role="tabpanel"
          aria-labelledby="tab-client-orders"
        >
          {error ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
              <button
                type="button"
                className="ml-2 font-medium text-violet-700 underline"
                onClick={() => void loadMyOrders()}
              >
                Retry
              </button>
            </p>
          ) : null}

          <div className="max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50/80 px-3 py-3 sm:px-4">
              <TablePaginationBar
                totalCount={ordersPagination.totalCount}
                pageIndex={ordersPagination.pageIndex}
                pageSize={ordersPagination.pageSize}
                onPageIndexChange={ordersPagination.setPageIndex}
                onPageSizeChange={ordersPagination.setPageSize}
                disabled={loading && rows.length === 0}
                itemLabel="orders"
              />
            </div>
            <HorizontalScrollMirror>
              <table className="w-max min-w-full border-collapse text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <tr>
                    <th
                      scope="col"
                      className="max-w-[6rem] min-w-0 px-2 py-2.5 sm:px-4 sm:py-3"
                    >
                      Order #
                    </th>
                    <th
                      scope="col"
                      className="max-w-[10rem] min-w-0 px-2 py-2.5 sm:px-4 sm:py-3"
                    >
                      Item
                    </th>
                    <th
                      scope="col"
                      className="max-w-[10rem] min-w-0 px-2 py-2.5 sm:px-4 sm:py-3"
                    >
                      Status
                    </th>
                    <th
                      scope="col"
                      className="max-w-[8rem] min-w-0 px-2 py-2.5 sm:px-4 sm:py-3"
                    >
                      Payment
                    </th>
                    <th
                      scope="col"
                      className="max-w-[8rem] min-w-0 px-2 py-2.5 sm:px-4 sm:py-3"
                    >
                      Amount
                    </th>
                    <th
                      scope="col"
                      className="max-w-[10rem] min-w-0 px-2 py-2.5 sm:px-4 sm:py-3"
                    >
                      Submitted
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {loading && rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-slate-500"
                      >
                        Loading…
                      </td>
                    </tr>
                  ) : null}
                  {!loading && rows.length === 0 && !error ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-slate-500"
                      >
                        No orders yet. Browse the catalog to place an order.
                      </td>
                    </tr>
                  ) : null}
                  {ordersPagination.pageItems.map((row) => (
                    <tr
                      key={row.id}
                      role="link"
                      tabIndex={0}
                      aria-label={`View order ${row.orderNumber}, ${row.itemLabel}`}
                      className="cursor-pointer hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                      onClick={() => navigate(`/orders/${row.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`/orders/${row.id}`);
                        }
                      }}
                    >
                      <td className="max-w-[6rem] min-w-0 px-2 py-2.5 align-top tabular-nums font-medium text-slate-900 sm:px-4 sm:py-3">
                        {row.orderNumber}
                      </td>
                      <td className="max-w-[10rem] min-w-0 break-words px-2 py-2.5 align-top sm:px-4 sm:py-3">
                        <span className="font-medium text-slate-900">
                          {row.itemLabel}
                        </span>
                        <span className="mt-0.5 block break-all font-mono text-[0.65rem] text-slate-500">
                          {row.itemSku}
                        </span>
                      </td>
                      <td className="max-w-[10rem] min-w-0 px-2 py-2.5 align-top sm:px-4 sm:py-3">
                        <OrderStatusBadge status={row.status} />
                      </td>
                      <td className="max-w-[8rem] min-w-0 break-words px-2 py-2.5 align-top text-slate-700 sm:px-4 sm:py-3">
                        {paymentTypeLabel(row.paymentType)}
                      </td>
                      <td className="max-w-[8rem] min-w-0 px-2 py-2.5 align-top tabular-nums text-slate-800 sm:px-4 sm:py-3">
                        {formatPhpDisplay(row.amount)}
                      </td>
                      <td className="max-w-[10rem] min-w-0 px-2 py-2.5 align-top sm:px-4 sm:py-3">
                        <SubmittedAtCell iso={row.createdAt} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </HorizontalScrollMirror>
          </div>
        </section>
      )}

      {tab === "waitlists" && (
        <section
          id="panel-client-waitlists"
          role="tabpanel"
          aria-labelledby="tab-client-waitlists"
        >
          {waitlistsError ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {waitlistsError}
              <button
                type="button"
                className="ml-2 font-medium text-violet-700 underline"
                onClick={() => void loadMyWaitlists()}
              >
                Retry
              </button>
            </p>
          ) : null}

          <div className="max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50/80 px-3 py-3 sm:px-4">
              <TablePaginationBar
                totalCount={waitlistsPagination.totalCount}
                pageIndex={waitlistsPagination.pageIndex}
                pageSize={waitlistsPagination.pageSize}
                onPageIndexChange={waitlistsPagination.setPageIndex}
                onPageSizeChange={waitlistsPagination.setPageSize}
                disabled={waitlistsLoading && waitlistRows.length === 0}
                itemLabel="waitlisted items"
              />
            </div>
            <HorizontalScrollMirror>
              <table className="w-max min-w-full border-collapse text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <tr>
                    <th
                      scope="col"
                      className="max-w-[14rem] min-w-0 px-2 py-2.5 sm:px-4 sm:py-3"
                    >
                      Item
                    </th>
                    <th
                      scope="col"
                      className="max-w-[10rem] min-w-0 px-2 py-2.5 sm:px-4 sm:py-3"
                    >
                      Status
                    </th>
                    <th
                      scope="col"
                      className="max-w-[8rem] min-w-0 px-2 py-2.5 sm:px-4 sm:py-3"
                    >
                      Price
                    </th>
                    <th
                      scope="col"
                      className="max-w-[10rem] min-w-0 px-2 py-2.5 sm:px-4 sm:py-3"
                    >
                      Waitlisted
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {waitlistsLoading && waitlistRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-8 text-center text-slate-500"
                      >
                        Loading…
                      </td>
                    </tr>
                  ) : null}
                  {!waitlistsLoading &&
                  waitlistRows.length === 0 &&
                  !waitlistsError ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-8 text-center text-slate-500"
                      >
                        No waitlisted items yet.
                      </td>
                    </tr>
                  ) : null}
                  {waitlistsPagination.pageItems.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="max-w-[14rem] min-w-0 break-words px-2 py-2.5 align-top sm:px-4 sm:py-3">
                        <span className="font-medium text-slate-900">
                          {row.productName || row.itemLabel}
                        </span>
                        <span className="mt-0.5 block break-all font-mono text-[0.65rem] text-slate-500">
                          {row.itemSku}
                        </span>
                      </td>
                      <td className="max-w-[10rem] min-w-0 px-2 py-2.5 align-top sm:px-4 sm:py-3">
                        <InventoryStatusBadge status={row.status} />
                      </td>
                      <td className="max-w-[8rem] min-w-0 px-2 py-2.5 align-top tabular-nums text-slate-800 sm:px-4 sm:py-3">
                        {formatPhpDisplay(row.price)}
                      </td>
                      <td className="max-w-[10rem] min-w-0 px-2 py-2.5 align-top sm:px-4 sm:py-3">
                        <SubmittedAtCell iso={row.createdAt} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </HorizontalScrollMirror>
          </div>
        </section>
      )}

      {tab === "appointments" && (
        <section
          id="panel-client-appointments"
          role="tabpanel"
          aria-labelledby="tab-client-appointments"
        >
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm leading-relaxed text-slate-600">
              Your appointments will appear here.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
