import { useCallback, useEffect, useId, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { InventoryStatusBadge } from "../components/InventoryStatusBadge";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import { branchLabel } from "../lib/consignment-schedule-labels";
import { formatOfferTransactionLabel } from "../lib/format-offer-transaction-type";
import { formatPhpDisplay } from "../lib/format-php";

type InventoryDetailForStaff = {
  id: string;
  sku: string;
  dateReceived: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  transactionType: string | null;
  currentBranch: string;
  inquiryId: string | null;
  inquirySku: string | null;
  consignorId: string | null;
  consignorName: string | null;
  consignorEmail: string | null;
  consignorPhone: string | null;
  inquiryOfferPrice: string | null;
  tbhSellingPrice: string | null;
  itemSnapshot: {
    clientItemId: string;
    form: Record<string, unknown>;
  };
  assignedToEmployeeId?: string | null;
  assignedToName?: string | null;
  authenticationStatus: string;
  itemPosting: {
    id: string;
    shopifyProductId: string | null;
    shopifyPostedAt: string | null;
  } | null;
};

type InventoryItemWaitlistClientRow = {
  id: string;
  clientId: string;
  firstName: string;
  lastName: string;
  email: string;
  contactNumber: string;
  createdAt: string;
};

type ClientAccountRow = {
  id: string;
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  contactNumber: string;
  createdAt: string;
};

function formatClientOption(c: ClientAccountRow): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  const primary = name || c.username;
  return `${primary} · ${c.email}`;
}

function formatDatePurchased(raw: unknown): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function yesNo(v: unknown): string {
  return v === true || v === "true" ? "Yes" : "No";
}

function isWaitlistViewableStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return (
    normalized === "available for purchase" ||
    normalized === "on hold" ||
    normalized === "for repricing"
  );
}

function isPriceViewableStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return (
    normalized === "available for purchase" ||
    normalized === "on hold" ||
    normalized === "for repricing"
  );
}

function isSoldUnderWarrantyStatus(status: string): boolean {
  return status.trim().toLowerCase() === "sold under warranty";
}

function clientName(row: InventoryItemWaitlistClientRow): string {
  return `${row.firstName} ${row.lastName}`.trim() || row.email;
}

const cardClass =
  "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900";

const recordActionBtn =
  "inline-flex shrink-0 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-900 transition-colors hover:bg-violet-100 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-100 dark:hover:bg-violet-900/80";

const clientSelectField =
  "box-border h-11 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-0 text-sm leading-5 text-slate-900 outline-none ring-violet-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

export function InventoryItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const waitlistModalTitleId = useId();
  const addClientModalTitleId = useId();
  const { token } = usePortalAuth();
  const [detail, setDetail] = useState<InventoryDetailForStaff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [waitlistModalOpen, setWaitlistModalOpen] = useState(false);
  const [waitlistRows, setWaitlistRows] = useState<
    InventoryItemWaitlistClientRow[]
  >([]);
  const [waitlistsLoading, setWaitlistsLoading] = useState(false);
  const [waitlistsError, setWaitlistsError] = useState<string | null>(null);
  const [addClientModalOpen, setAddClientModalOpen] = useState(false);
  const [clients, setClients] = useState<ClientAccountRow[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [addClientBusy, setAddClientBusy] = useState(false);
  const [addClientError, setAddClientError] = useState<string | null>(null);
  const [markSoldFinalConfirmOpen, setMarkSoldFinalConfirmOpen] =
    useState(false);
  const [markSoldFinalBusy, setMarkSoldFinalBusy] = useState(false);
  const [markSoldFinalError, setMarkSoldFinalError] = useState<string | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch(`/api/inventory/${id}`, {}, token);
      if (!res.ok) {
        const msg =
          res.status === 404
            ? "Inventory item not found."
            : `Request failed (${res.status})`;
        throw new Error(msg);
      }
      const data = (await res.json()) as InventoryDetailForStaff;
      setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load item");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadWaitlists = useCallback(async () => {
    if (!id) return;
    setWaitlistsError(null);
    setWaitlistsLoading(true);
    try {
      const res = await apiFetch(`/api/inventory/${id}/waitlists`, {}, token);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as InventoryItemWaitlistClientRow[];
      setWaitlistRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setWaitlistsError(
        e instanceof Error ? e.message : "Failed to load waitlist",
      );
      setWaitlistRows([]);
    } finally {
      setWaitlistsLoading(false);
    }
  }, [id, token]);

  const openWaitlistModal = useCallback(() => {
    setWaitlistModalOpen(true);
    void loadWaitlists();
  }, [loadWaitlists]);

  const closeWaitlistModal = useCallback(() => {
    setWaitlistModalOpen(false);
    setAddClientModalOpen(false);
    setSelectedClientId("");
    setAddClientError(null);
  }, []);

  const loadClients = useCallback(async () => {
    setClientsError(null);
    setClientsLoading(true);
    try {
      const res = await apiFetch("/api/accounts/clients", {}, token);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as ClientAccountRow[];
      setClients(Array.isArray(data) ? data : []);
    } catch (e) {
      setClientsError(
        e instanceof Error ? e.message : "Failed to load client accounts",
      );
      setClients([]);
    } finally {
      setClientsLoading(false);
    }
  }, [token]);

  const openAddClientModal = useCallback(() => {
    setAddClientModalOpen(true);
    setSelectedClientId("");
    setAddClientError(null);
    void loadClients();
  }, [loadClients]);

  const closeAddClientModal = useCallback(() => {
    setAddClientModalOpen(false);
    setSelectedClientId("");
    setAddClientError(null);
  }, []);

  const submitAddClientToWaitlist = useCallback(async () => {
    if (!id || !selectedClientId) {
      setAddClientError("Select a client.");
      return;
    }
    setAddClientBusy(true);
    setAddClientError(null);
    try {
      const res = await apiFetch(
        `/api/inventory/${id}/waitlists`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: selectedClientId }),
        },
        token,
      );
      if (!res.ok) {
        let message = `Request failed (${res.status})`;
        try {
          const body = (await res.json()) as { message?: string | string[] };
          if (typeof body.message === "string") message = body.message;
          else if (Array.isArray(body.message)) message = body.message.join(", ");
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }
      const row = (await res.json()) as InventoryItemWaitlistClientRow;
      setWaitlistRows((prev) => {
        const withoutDuplicate = prev.filter((r) => r.clientId !== row.clientId);
        return [row, ...withoutDuplicate];
      });
      closeAddClientModal();
    } catch (e) {
      setAddClientError(
        e instanceof Error ? e.message : "Failed to add client to waitlist",
      );
    } finally {
      setAddClientBusy(false);
    }
  }, [closeAddClientModal, id, selectedClientId, token]);

  const confirmMarkSoldFinal = useCallback(async () => {
    if (!id) return;
    setMarkSoldFinalError(null);
    setMarkSoldFinalBusy(true);
    try {
      const res = await apiFetch(
        `/api/inventory/${id}/mark-sold-final`,
        { method: "POST" },
        token,
      );
      if (!res.ok) {
        let message = `Request failed (${res.status})`;
        try {
          const body = (await res.json()) as { message?: string | string[] };
          if (typeof body.message === "string") message = body.message;
          else if (Array.isArray(body.message)) message = body.message.join(", ");
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }
      setMarkSoldFinalConfirmOpen(false);
      await load();
    } catch (e) {
      setMarkSoldFinalError(
        e instanceof Error ? e.message : "Failed to mark as sold final",
      );
    } finally {
      setMarkSoldFinalBusy(false);
    }
  }, [id, load, token]);

  useEffect(() => {
    if (!waitlistModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (addClientModalOpen) {
        closeAddClientModal();
        return;
      }
      closeWaitlistModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    addClientModalOpen,
    closeAddClientModal,
    closeWaitlistModal,
    waitlistModalOpen,
  ]);

  if (loading) {
    return (
      <div className="text-sm text-slate-600 dark:text-slate-400">Loading…</div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error ?? "Unable to load this item."}
        </p>
        <Link
          to="/portal/inventory"
          className="text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
        >
          ← Back to inventory
        </Link>
      </div>
    );
  }

  const form = detail.itemSnapshot.form;
  const brand = str(form.brand);
  const itemModel = str(form.itemModel);
  const brandModelSubtitle =
    brand && itemModel ? `${brand} — ${itemModel}` : brand || itemModel || "—";
  const showPricing = isPriceViewableStatus(detail.status);
  const waitlistedClientIds = new Set(waitlistRows.map((row) => row.clientId));
  const selectableClients = clients
    .filter((c) => c.id !== detail.consignorId)
    .filter((c) => !waitlistedClientIds.has(c.id))
    .sort((a, b) =>
      formatClientOption(a).localeCompare(formatClientOption(b), undefined, {
        sensitivity: "base",
      }),
    );

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Inventory item
          </p>
          <h1 className="mt-1 break-all font-mono text-xl font-semibold text-slate-900 dark:text-slate-100">
            {detail.sku}
          </h1>
          <p className="mt-2 break-words text-base text-slate-700 dark:text-slate-300">
            {brandModelSubtitle}
          </p>
        </div>
        <Link
          to="/portal/inventory"
          className="shrink-0 text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
        >
          ← Back to inventory
        </Link>
      </div>

      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            Record
          </h2>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {isWaitlistViewableStatus(detail.status) ? (
            <button
              type="button"
              className={recordActionBtn}
              onClick={openWaitlistModal}
            >
              View waitlist
            </button>
          ) : null}
          {showPricing && detail.itemPosting ? (
            <Link
              to={`/portal/posting/${detail.id}`}
              className={recordActionBtn}
            >
              Manage Shopify listing
            </Link>
          ) : null}
          {detail.authenticationStatus.trim().toLowerCase() !== "pending" ? (
            <Link
              to={`/portal/inventory/${detail.id}/authentication`}
              className={recordActionBtn}
            >
              View authentication results
            </Link>
          ) : null}
          {detail.inquiryId ? (
            <Link
              to={`/portal/inquiries/${detail.inquiryId}`}
              className={recordActionBtn}
            >
              View inquiry
            </Link>
          ) : null}
          {isSoldUnderWarrantyStatus(detail.status) ? (
            <button
              type="button"
              className={recordActionBtn}
              onClick={() => {
                setMarkSoldFinalError(null);
                setMarkSoldFinalConfirmOpen(true);
              }}
            >
              Mark as Sold Final
            </button>
          ) : null}
        </div>
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 text-sm text-slate-800 dark:text-slate-200 sm:grid-cols-2">
          <div>
            <dt className="text-slate-500 dark:text-slate-400">
              Date received
            </dt>
            <dd>
              <SubmittedAtCell iso={detail.dateReceived} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Status</dt>
            <dd>
              <InventoryStatusBadge status={detail.status} />
            </dd>
          </div>
          {detail.itemPosting?.shopifyProductId ? (
            <div className="sm:col-span-2">
              <dt className="text-slate-500 dark:text-slate-400">
                Shopify product ID
              </dt>
              <dd className="break-all font-mono text-sm">
                {detail.itemPosting.shopifyProductId}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Transaction</dt>
            <dd>
              {formatOfferTransactionLabel(
                detail.transactionType as
                  | "consignment"
                  | "direct_purchase"
                  | null,
              )}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Branch</dt>
            <dd>{branchLabel(detail.currentBranch)}</dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Created</dt>
            <dd>
              <SubmittedAtCell iso={detail.createdAt} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Last updated</dt>
            <dd>
              <SubmittedAtCell iso={detail.updatedAt} />
            </dd>
          </div>
        </dl>
      </div>

      {detail.consignorName ||
      detail.consignorEmail ||
      detail.consignorPhone ||
      detail.consignorId ? (
        <div className={cardClass}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            Consignor
          </h2>
          <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 text-sm text-slate-800 dark:text-slate-200 sm:grid-cols-2">
            {detail.consignorName ? (
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Name</dt>
                <dd className="font-medium">{detail.consignorName}</dd>
              </div>
            ) : null}
            {detail.consignorEmail ? (
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Email</dt>
                <dd className="break-all">{detail.consignorEmail}</dd>
              </div>
            ) : null}
            {detail.consignorPhone ? (
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Phone</dt>
                <dd>{detail.consignorPhone}</dd>
              </div>
            ) : null}
            {detail.consignorId ? (
              <div className="sm:col-span-2">
                <dt className="text-slate-500 dark:text-slate-400">
                  Client ID
                </dt>
                <dd className="break-all font-mono text-xs">
                  {detail.consignorId}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}

      <div className={cardClass}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Item details
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 text-sm text-slate-800 dark:text-slate-200 sm:grid-cols-2">
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Category</dt>
            <dd>{str(form.category) || "—"}</dd>
          </div>
          {str(form.serialNumber) ? (
            <div>
              <dt className="text-slate-500 dark:text-slate-400">
                Serial number
              </dt>
              <dd className="break-all font-mono text-xs sm:text-sm">
                {str(form.serialNumber)}
              </dd>
            </div>
          ) : null}
          {str(form.color) ? (
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Color</dt>
              <dd>{str(form.color)}</dd>
            </div>
          ) : null}
          {str(form.material) ? (
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Material</dt>
              <dd>{str(form.material)}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Condition</dt>
            <dd>{str(form.condition) || "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-slate-500 dark:text-slate-400">Inclusions</dt>
            <dd className="whitespace-pre-wrap">
              {str(form.inclusions) || "—"}
            </dd>
          </div>
          {form.datePurchased ? (
            <div>
              <dt className="text-slate-500 dark:text-slate-400">
                Date purchased
              </dt>
              <dd>{formatDatePurchased(form.datePurchased)}</dd>
            </div>
          ) : null}
          {str(form.sourceOfPurchase) ? (
            <div>
              <dt className="text-slate-500 dark:text-slate-400">
                Source of purchase
              </dt>
              <dd>{str(form.sourceOfPurchase)}</dd>
            </div>
          ) : null}
          {showPricing ? (
            <>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">
                  Consignor price
                </dt>
                <dd className="tabular-nums">
                  {formatPhpDisplay(detail.inquiryOfferPrice)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">
                  TBH selling price
                </dt>
                <dd className="tabular-nums">
                  {formatPhpDisplay(detail.tbhSellingPrice)}
                </dd>
              </div>
            </>
          ) : null}
          {str(form.consignmentSellingPrice) ? (
            <div>
              <dt className="text-slate-500 dark:text-slate-400">
                Consignment selling price
              </dt>
              <dd className="tabular-nums">
                {formatPhpDisplay(str(form.consignmentSellingPrice))}
              </dd>
            </div>
          ) : null}
          {str(form.directPurchaseSellingPrice) ? (
            <div>
              <dt className="text-slate-500 dark:text-slate-400">
                Direct purchase selling price
              </dt>
              <dd className="tabular-nums">
                {formatPhpDisplay(str(form.directPurchaseSellingPrice))}
              </dd>
            </div>
          ) : null}
          {str(form.specialInstructions) ? (
            <div className="sm:col-span-2">
              <dt className="text-slate-500 dark:text-slate-400">
                Special instructions
              </dt>
              <dd className="whitespace-pre-wrap">
                {str(form.specialInstructions)}
              </dd>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <dt className="text-slate-500 dark:text-slate-400">Consents</dt>
            <dd className="text-sm">
              Direct purchase &amp; terms: {yesNo(form.consentDirectPurchase)}
              <br />
              Price nomination (market research):{" "}
              {yesNo(form.consentPriceNomination)}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-slate-500 dark:text-slate-400">
              Snapshot client item ID
            </dt>
            <dd className="break-all font-mono text-xs">
              {detail.itemSnapshot.clientItemId}
            </dd>
          </div>
        </dl>
      </div>

      {waitlistModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal
          aria-labelledby={waitlistModalTitleId}
          onClick={closeWaitlistModal}
        >
          <div
            className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="min-w-0">
                <h2
                  id={waitlistModalTitleId}
                  className="text-base font-semibold text-slate-900 dark:text-slate-100"
                >
                  Waitlist
                </h2>
                <p className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">
                  {detail.sku}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className={recordActionBtn}
                  onClick={openAddClientModal}
                >
                  Add client
                </button>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-slate-300 dark:hover:bg-slate-800"
                  onClick={closeWaitlistModal}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="max-h-[70vh] overflow-auto p-4">
              {waitlistsError ? (
                <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                  {waitlistsError}
                  <button
                    type="button"
                    className="ml-2 font-medium text-violet-700 underline dark:text-violet-300"
                    onClick={() => void loadWaitlists()}
                  >
                    Retry
                  </button>
                </p>
              ) : null}

              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                    <tr>
                      <th scope="col" className="px-3 py-2.5">
                        Client
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Email
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Contact
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Waitlisted
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {waitlistsLoading && waitlistRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-8 text-center text-slate-500 dark:text-slate-400"
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
                          className="px-3 py-8 text-center text-slate-500 dark:text-slate-400"
                        >
                          No clients are waitlisted for this item.
                        </td>
                      </tr>
                    ) : null}
                    {waitlistRows.map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-2.5 align-top">
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {clientName(row)}
                          </span>
                          <span className="mt-0.5 block break-all font-mono text-[0.65rem] text-slate-500 dark:text-slate-400">
                            {row.clientId}
                          </span>
                        </td>
                        <td className="break-all px-3 py-2.5 align-top text-slate-700 dark:text-slate-300">
                          {row.email}
                        </td>
                        <td className="px-3 py-2.5 align-top text-slate-700 dark:text-slate-300">
                          {row.contactNumber}
                        </td>
                        <td className="px-3 py-2.5 align-top text-slate-700 dark:text-slate-300">
                          <SubmittedAtCell iso={row.createdAt} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {addClientModalOpen ? (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
              role="dialog"
              aria-modal
              aria-labelledby={addClientModalTitleId}
              onClick={closeAddClientModal}
            >
              <div
                className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                  <h3
                    id={addClientModalTitleId}
                    className="text-base font-semibold text-slate-900 dark:text-slate-100"
                  >
                    Add client to waitlist
                  </h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Select a client to add to the waitlist for this item.
                  </p>
                </div>

                <div className="space-y-4 p-4">
                  <div>
                    <label
                      htmlFor="waitlist-client-select"
                      className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-200"
                    >
                      Client
                    </label>
                    <select
                      id="waitlist-client-select"
                      className={clientSelectField}
                      value={selectedClientId}
                      onChange={(e) => setSelectedClientId(e.target.value)}
                      disabled={
                        clientsLoading || !!clientsError || addClientBusy
                      }
                      aria-busy={clientsLoading}
                    >
                      <option value="">
                        {clientsLoading
                          ? "Loading clients…"
                          : "Select a client…"}
                      </option>
                      {selectableClients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {formatClientOption(c)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {clientsError ? (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                      {clientsError}
                      <button
                        type="button"
                        className="ml-2 font-medium text-violet-700 underline dark:text-violet-300"
                        onClick={() => void loadClients()}
                      >
                        Retry
                      </button>
                    </p>
                  ) : null}

                  {!clientsLoading &&
                  !clientsError &&
                  selectableClients.length === 0 ? (
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      No eligible clients are available to add. The consignor and
                      clients already on the waitlist are excluded.
                    </p>
                  ) : null}

                  {addClientError ? (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                      {addClientError}
                    </p>
                  ) : null}
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
                  <button
                    type="button"
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-slate-200 dark:hover:bg-slate-800"
                    onClick={closeAddClientModal}
                    disabled={addClientBusy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => void submitAddClientToWaitlist()}
                    disabled={
                      addClientBusy ||
                      clientsLoading ||
                      !!clientsError ||
                      !selectedClientId
                    }
                  >
                    {addClientBusy ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={markSoldFinalConfirmOpen}
        title="Mark as Sold Final?"
        description="This will update the inventory item status from Sold under warranty to Sold final. This action cannot be undone."
        confirmLabel="Mark as Sold Final"
        cancelLabel="Cancel"
        busy={markSoldFinalBusy}
        errorMessage={markSoldFinalError}
        onCancel={() => {
          if (markSoldFinalBusy) return;
          setMarkSoldFinalError(null);
          setMarkSoldFinalConfirmOpen(false);
        }}
        onConfirm={confirmMarkSoldFinal}
      />
    </div>
  );
}
