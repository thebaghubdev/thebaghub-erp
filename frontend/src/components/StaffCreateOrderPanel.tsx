import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { TermsScrollAgreeModal } from "./TermsScrollAgreeModal";
import { OfferSignatureField } from "./OfferSignatureField";
import { apiFetch } from "../lib/api";
import { useUnsavedChangesGuard } from "../context/unsaved-changes";
import { getLayawayEligibility } from "../lib/layaway-eligibility";
import {
  calculateLayawayPricing,
  clampLayawayMonths,
  DEFAULT_LAYAWAY_MONTHS,
  layawayMonthlyRateLabel,
  MAX_LAYAWAY_MONTHS,
  MIN_LAYAWAY_MONTHS,
} from "../lib/layaway-pricing";
import {
  isInstallmentPaymentType,
  orderPaymentTypeOptions,
  type OrderPaymentType,
} from "../lib/order-status-filter-options";
import {
  formatPhpAmount,
  formatPhpDisplay,
  parsePhpStringToNumber,
} from "../lib/format-php";
import {
  pickVipPriceForClient,
  vipPriceFieldLabel,
} from "../lib/vip-pricing";
import {
  EMPTY_ORDER_PICKUP_FORM,
  isOrderPickupFormValid,
  orderPickupPayloadFields,
  type OrderPickupFormValues,
} from "../lib/order-pickup-form";
import { OrderPickupFormFields } from "./OrderPickupFormFields";

type ClientAccountRow = {
  id: string;
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  contactNumber: string;
  vipStatus?: "Regular" | "Gold" | "Diamond";
  createdAt: string;
};

type ClientAccountDetail = ClientAccountRow & {
  completeAddress: string | null;
  isCreditLine: boolean;
  vipStatus: "Regular" | "Gold" | "Diamond";
};

type InventorySearchRow = {
  id: string;
  sku: string;
  itemLabel: string;
  productName: string;
  status: string;
  tbhSellingPrice: string | null;
  onPromo?: boolean;
  promoPrice?: string | null;
  consignorName: string | null;
};

type InventoryDetailForStaff = {
  id: string;
  sku: string;
  status: string;
  tbhSellingPrice: string | null;
  creditCardPrice: string | null;
  onPromo?: boolean;
  promoPrice?: string | null;
  enableDiscount?: boolean;
  vipGoldPrice?: string | null;
  vipDiamondPrice?: string | null;
  consignorId: string | null;
  itemSnapshot: {
    form: Record<string, unknown>;
  };
  authenticationDetails: {
    rating: string | null;
    dimensions: string | null;
  } | null;
  itemPosting: {
    productName: string;
    productDescription: string | null;
    selectedPhotosSnapshot: Array<Record<string, unknown>>;
  } | null;
};

const AVAILABLE_FOR_PURCHASE = "Available For Purchase";

function effectiveItemListPrice(item: {
  onPromo?: boolean;
  promoPrice?: string | null;
  tbhSellingPrice: string | null;
}): string | null {
  if (item.onPromo && item.promoPrice != null && item.promoPrice.trim() !== "") {
    return item.promoPrice;
  }
  return item.tbhSellingPrice;
}

const LAYAWAY_TERMS_URL = "/terms/layaway.txt";
const ORDER_SALES_CONTRACT_TERMS_URL = "/terms/order-sales-contract.txt";

const labelCellClassName =
  "border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-sm font-normal text-slate-600 align-top w-28 sm:w-32 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400";
const valueCellClassName =
  "border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-900 align-top break-words whitespace-normal dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

const formFieldClassName =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

const selectFieldClassName = formFieldClassName;
const readonlyFormFieldClassName = `${formFieldClassName} bg-slate-50 dark:bg-slate-800/60`;

const clientSelectField =
  "box-border h-11 min-h-11 w-full max-w-xl rounded-lg border border-slate-300 bg-white px-3 py-0 text-sm leading-5 text-slate-900 outline-none ring-violet-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

function formatClientSummary(c: ClientAccountRow): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  const primary = name || c.username;
  return `${primary} · ${c.email}`;
}

function displayOrDash(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value).trim();
  return text ? text : "—";
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function inventorySearchText(item: InventorySearchRow): string {
  return [item.sku, item.itemLabel, item.productName]
    .join(" ")
    .toLowerCase();
}

function DescriptionTable({
  rows,
}: {
  rows: Array<
    Array<{ label: string; value: ReactNode; valueColSpan?: number }>
  >;
}) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-28 sm:w-32" />
          <col />
          <col className="w-28 sm:w-32" />
          <col />
        </colgroup>
        <tbody>
          {rows.map((cells, rowIndex) => (
            <tr key={rowIndex}>
              {cells.flatMap((cell) => {
                if (!cell.label) {
                  return [
                    <td
                      key={`${rowIndex}-value`}
                      colSpan={4}
                      className={valueCellClassName}
                    >
                      {cell.value}
                    </td>,
                  ];
                }

                return [
                  <th
                    key={`${cell.label}-label`}
                    className={labelCellClassName}
                  >
                    {cell.label}
                  </th>,
                  <td
                    key={`${cell.label}-value`}
                    colSpan={cell.valueColSpan}
                    className={valueCellClassName}
                  >
                    {cell.value}
                  </td>,
                ];
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function readApiErrorMessage(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(j.message)) return j.message.join("; ");
    if (typeof j.message === "string") return j.message;
  } catch {
    /* ignore */
  }
  return `Request failed (${res.status})`;
}

type StaffCreateOrderPanelProps = {
  portalToken: string;
  onSubmitted: (orderId: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

export function StaffCreateOrderPanel({
  portalToken,
  onSubmitted,
  onDirtyChange,
}: StaffCreateOrderPanelProps) {
  const [clients, setClients] = useState<ClientAccountRow[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState("");

  const [inventoryRows, setInventoryRows] = useState<InventorySearchRow[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [itemSearchQuery, setItemSearchQuery] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [itemDetail, setItemDetail] = useState<InventoryDetailForStaff | null>(
    null,
  );
  const [itemDetailLoading, setItemDetailLoading] = useState(false);
  const [itemDetailError, setItemDetailError] = useState<string | null>(null);

  const [clientDetail, setClientDetail] = useState<ClientAccountDetail | null>(
    null,
  );
  const [clientDetailLoading, setClientDetailLoading] = useState(false);

  const [photosModalOpen, setPhotosModalOpen] = useState(false);
  const [paymentType, setPaymentType] = useState<OrderPaymentType>("full_payment");
  const [layawayMonths, setLayawayMonths] = useState(
    String(DEFAULT_LAYAWAY_MONTHS),
  );
  const [layawayTermsAccepted, setLayawayTermsAccepted] = useState(false);
  const [layawayTermsModalOpen, setLayawayTermsModalOpen] = useState(false);
  const [orderTermsAccepted, setOrderTermsAccepted] = useState(false);
  const [orderTermsModalOpen, setOrderTermsModalOpen] = useState(false);
  const [orderSignatureFile, setOrderSignatureFile] = useState<File | null>(
    null,
  );
  const [signatureFieldKey, setSignatureFieldKey] = useState(0);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pickupForm, setPickupForm] = useState<OrderPickupFormValues>(
    EMPTY_ORDER_PICKUP_FORM,
  );
  const photosModalTitleId = useId();

  const sortedClients = useMemo(() => {
    return [...clients].sort((a, b) => {
      const ln = a.lastName.localeCompare(b.lastName);
      if (ln !== 0) return ln;
      return a.firstName.localeCompare(b.firstName);
    });
  }, [clients]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) ?? null,
    [clients, selectedClientId],
  );

  const purchasableItems = useMemo(
    () => inventoryRows.filter((row) => row.status === AVAILABLE_FOR_PURCHASE),
    [inventoryRows],
  );

  const itemSearchResults = useMemo(() => {
    const q = itemSearchQuery.trim().toLowerCase();
    if (!q) return [];
    return purchasableItems
      .filter((item) => inventorySearchText(item).includes(q))
      .slice(0, 12);
  }, [itemSearchQuery, purchasableItems]);

  const isDirty =
    selectedClientId !== "" ||
    selectedItemId !== "" ||
    itemSearchQuery.trim() !== "" ||
    paymentType !== "full_payment" ||
    layawayMonths !== String(DEFAULT_LAYAWAY_MONTHS) ||
    layawayTermsAccepted ||
    orderTermsAccepted ||
    orderSignatureFile != null ||
    JSON.stringify(pickupForm) !== JSON.stringify(EMPTY_ORDER_PICKUP_FORM);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useUnsavedChangesGuard({
    isDirty,
    bypass: submitBusy,
    description: "You have unsaved changes to this order. Leave this page?",
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setClientsError(null);
      setClientsLoading(true);
      try {
        const res = await apiFetch("/api/accounts/clients", {}, portalToken);
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = (await res.json()) as ClientAccountRow[];
        if (!cancelled) setClients(data);
      } catch (e) {
        if (!cancelled) {
          setClientsError(
            e instanceof Error ? e.message : "Failed to load client accounts",
          );
          setClients([]);
        }
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [portalToken]);

  useEffect(() => {
    if (!selectedClientId) {
      setClientDetail(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      setClientDetailLoading(true);
      try {
        const res = await apiFetch(
          `/api/accounts/clients/${selectedClientId}`,
          {},
          portalToken,
        );
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = (await res.json()) as ClientAccountDetail;
        if (!cancelled) setClientDetail(data);
      } catch {
        if (!cancelled) setClientDetail(null);
      } finally {
        if (!cancelled) setClientDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [portalToken, selectedClientId]);

  useEffect(() => {
    if (!selectedClientId) {
      setInventoryRows([]);
      setSelectedItemId("");
      setItemSearchQuery("");
      setItemDetail(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      setInventoryError(null);
      setInventoryLoading(true);
      try {
        const res = await apiFetch("/api/inventory", {}, portalToken);
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = (await res.json()) as InventorySearchRow[];
        if (!cancelled) setInventoryRows(data);
      } catch (e) {
        if (!cancelled) {
          setInventoryError(
            e instanceof Error ? e.message : "Failed to load inventory",
          );
          setInventoryRows([]);
        }
      } finally {
        if (!cancelled) setInventoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [portalToken, selectedClientId]);

  useEffect(() => {
    if (!selectedItemId) {
      setItemDetail(null);
      setItemDetailError(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      setItemDetailLoading(true);
      setItemDetailError(null);
      try {
        const res = await apiFetch(
          `/api/inventory/${selectedItemId}`,
          {},
          portalToken,
        );
        if (res.status === 404) throw new Error("Item not found.");
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = (await res.json()) as InventoryDetailForStaff;
        if (!cancelled) setItemDetail(data);
      } catch (e) {
        if (!cancelled) {
          setItemDetailError(
            e instanceof Error ? e.message : "Failed to load item",
          );
          setItemDetail(null);
        }
      } finally {
        if (!cancelled) setItemDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [portalToken, selectedItemId]);

  useEffect(() => {
    setSelectedItemId("");
    setItemSearchQuery("");
    setItemDetail(null);
    setPaymentType("full_payment");
    setLayawayMonths(String(DEFAULT_LAYAWAY_MONTHS));
    setLayawayTermsAccepted(false);
    setOrderTermsAccepted(false);
    setOrderSignatureFile(null);
    setSignatureFieldKey((k) => k + 1);
    setSubmitError(null);
  }, [selectedClientId]);

  useEffect(() => {
    if (!photosModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPhotosModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photosModalOpen]);

  const itemPhotos = useMemo(() => {
    if (!itemDetail?.itemPosting?.selectedPhotosSnapshot) return [];
    return itemDetail.itemPosting.selectedPhotosSnapshot
      .map((photo, idx) => ({
        key: str(photo.key) || `photo-${idx}`,
        url: str(photo.url),
      }))
      .filter((photo) => photo.url);
  }, [itemDetail]);

  const vipForClient = useMemo(
    () =>
      pickVipPriceForClient(
        clientDetail?.vipStatus,
        itemDetail?.vipGoldPrice,
        itemDetail?.vipDiamondPrice,
      ),
    [
      clientDetail?.vipStatus,
      itemDetail?.vipGoldPrice,
      itemDetail?.vipDiamondPrice,
    ],
  );

  const descriptionRows = useMemo(() => {
    if (!itemDetail) return [];
    const form = itemDetail.itemSnapshot.form;
    const posting = itemDetail.itemPosting;
    const productName = posting?.productName?.trim() || displayOrDash(form.brand);
    const viewPhotosValue =
      itemPhotos.length > 0 ? (
        <button
          type="button"
          onClick={() => setPhotosModalOpen(true)}
          className="text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
        >
          View photos
        </button>
      ) : (
        <span className="text-slate-500">No photos available</span>
      );

    return [
      [{ label: "SKU", value: itemDetail.sku, valueColSpan: 3 }],
      [{ label: "Photos", value: viewPhotosValue, valueColSpan: 3 }],
      [{ label: "Product name", value: productName, valueColSpan: 3 }],
      [
        {
          label: "Best price",
          value: formatPhpDisplay(effectiveItemListPrice(itemDetail)),
          valueColSpan: 3,
        },
      ],
      ...(vipForClient.vipPrice
        ? [
            [
              {
                label: vipPriceFieldLabel(vipForClient.vipTier),
                value: formatPhpDisplay(vipForClient.vipPrice),
                valueColSpan: 3,
              },
            ],
          ]
        : []),
      [
        {
          label: "Credit card price",
          value: formatPhpDisplay(itemDetail.creditCardPrice),
          valueColSpan: 3,
        },
      ],
      [
        {
          label: "Inclusions",
          value: displayOrDash(form.inclusions),
          valueColSpan: 3,
        },
      ],
      [
        {
          label: "Rating",
          value: displayOrDash(itemDetail.authenticationDetails?.rating),
        },
        {
          label: "Dimensions",
          value: displayOrDash(itemDetail.authenticationDetails?.dimensions),
        },
      ],
    ];
  }, [itemDetail, itemPhotos.length, vipForClient]);

  const customerDetailsRows = useMemo(() => {
    const client = clientDetail ?? selectedClient;
    if (!client) return [];
    const name = [client.firstName, client.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    return [
      [{ label: "Customer name", value: name || client.username, valueColSpan: 3 }],
      [
        {
          label: "Contact number",
          value: client.contactNumber?.trim() || "—",
          valueColSpan: 3,
        },
      ],
      [
        {
          label: "Email",
          value: client.email?.trim() || client.username || "—",
          valueColSpan: 3,
        },
      ],
      [
        {
          label: "Complete address",
          value: clientDetail?.completeAddress?.trim() || "—",
          valueColSpan: 3,
        },
      ],
    ];
  }, [clientDetail, selectedClient]);

  const itemPrice = useMemo(() => {
    if (vipForClient.vipPrice) {
      return parsePhpStringToNumber(String(vipForClient.vipPrice));
    }
    return itemDetail
      ? parsePhpStringToNumber(
          String(effectiveItemListPrice(itemDetail) ?? ""),
        )
      : null;
  }, [itemDetail, vipForClient.vipPrice]);

  const layawayEligibility = useMemo(() => {
    if (!itemDetail) return { allowed: true, reasons: [] as string[] };
    const category =
      typeof itemDetail.itemSnapshot.form.category === "string"
        ? itemDetail.itemSnapshot.form.category
        : null;
    return getLayawayEligibility(
      itemDetail.authenticationDetails?.rating ?? null,
      category,
    );
  }, [itemDetail]);

  const isCreditLine = Boolean(clientDetail?.isCreditLine);
  const paymentTypeOptions = useMemo(
    () => orderPaymentTypeOptions(isCreditLine),
    [isCreditLine],
  );

  useEffect(() => {
    if (!layawayEligibility.allowed && paymentType === "layaway") {
      setPaymentType("full_payment");
      setLayawayTermsAccepted(false);
      setLayawayTermsModalOpen(false);
      setOrderSignatureFile(null);
      setSignatureFieldKey((k) => k + 1);
    }
  }, [layawayEligibility.allowed, paymentType]);

  useEffect(() => {
    if (!isCreditLine && paymentType === "credit_line") {
      setPaymentType("full_payment");
      setOrderSignatureFile(null);
      setSignatureFieldKey((k) => k + 1);
    }
  }, [isCreditLine, paymentType]);

  const layawayMonthsNumber = useMemo(() => {
    const n = Number.parseInt(layawayMonths, 10);
    return Number.isFinite(n) ? n : null;
  }, [layawayMonths]);

  const layawayPricing = useMemo(() => {
    if (itemPrice == null || layawayMonthsNumber == null) return null;
    return calculateLayawayPricing(itemPrice, layawayMonthsNumber);
  }, [itemPrice, layawayMonthsNumber]);

  const layawayPriceDisplay =
    layawayPricing != null ? formatPhpAmount(layawayPricing.layawayPrice) : "—";
  const monthlyPaymentDisplay =
    layawayPricing != null
      ? formatPhpAmount(layawayPricing.monthlyPayment)
      : "—";
  const layawayRateNote =
    itemPrice != null
      ? `Layaway rate for this item: ${layawayMonthlyRateLabel(itemPrice)} per month.`
      : null;

  const ownItemConflict =
    itemDetail != null &&
    selectedClient != null &&
    itemDetail.consignorId === selectedClient.id;

  const canSubmitOrder =
    !submitBusy &&
    selectedClient != null &&
    selectedItemId !== "" &&
    itemDetail != null &&
    !ownItemConflict &&
    orderSignatureFile != null &&
    orderTermsAccepted &&
    isOrderPickupFormValid(pickupForm) &&
    (!isInstallmentPaymentType(paymentType) || layawayTermsAccepted);

  const handleSelectSearchResult = (item: InventorySearchRow) => {
    setSelectedItemId(item.id);
    setItemSearchQuery(`${item.sku} · ${item.productName || item.itemLabel}`);
    setSubmitError(null);
  };

  const handleClearSelectedItem = () => {
    setSelectedItemId("");
    setItemSearchQuery("");
    setItemDetail(null);
    setPaymentType("full_payment");
    setLayawayTermsAccepted(false);
    setOrderTermsAccepted(false);
    setOrderSignatureFile(null);
    setSignatureFieldKey((k) => k + 1);
    setPickupForm(EMPTY_ORDER_PICKUP_FORM);
    setSubmitError(null);
  };

  const handleSubmitOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (
      !selectedClient ||
      !selectedItemId ||
      !canSubmitOrder ||
      !orderSignatureFile
    ) {
      return;
    }

    if (
      isInstallmentPaymentType(paymentType) &&
      layawayMonthsNumber == null
    ) {
      setSubmitError("Please enter a valid number of layaway months.");
      return;
    }

    setSubmitError(null);
    setSubmitBusy(true);
    try {
      const payload: Record<string, unknown> = {
        customerId: selectedClient.id,
        inventoryItemId: selectedItemId,
        paymentType,
        ...orderPickupPayloadFields(pickupForm),
      };
      if (isInstallmentPaymentType(paymentType)) {
        payload.layawayMonths = layawayMonthsNumber;
      }

      const fd = new FormData();
      fd.append("payload", JSON.stringify(payload));
      fd.append("signature", orderSignatureFile);

      const res = await apiFetch(
        "/api/orders",
        { method: "POST", body: fd },
        portalToken,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));

      const data = (await res.json()) as { id: string };
      onSubmitted(data.id);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Could not submit order",
      );
    } finally {
      setSubmitBusy(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <label
          htmlFor="staff-order-client"
          className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-200"
        >
          Customer (client account)
        </label>
        <select
          id="staff-order-client"
          className={clientSelectField}
          value={selectedClientId}
          onChange={(e) => setSelectedClientId(e.target.value)}
          disabled={clientsLoading || !!clientsError}
          aria-busy={clientsLoading}
        >
          <option value="">
            {clientsLoading ? "Loading clients…" : "Select a customer…"}
          </option>
          {sortedClients.map((c) => (
            <option key={c.id} value={c.id}>
              {formatClientSummary(c)}
            </option>
          ))}
        </select>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Staff orders must be tied to an existing client account, just like
          walk-in inquiries.
        </p>
        {clientsError ? (
          <p
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            role="alert"
          >
            {clientsError}
          </p>
        ) : null}
      </div>

      {selectedClient ? (
        <>
          <div>
            <label
              htmlFor="staff-order-item-search"
              className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-200"
            >
              Search item by SKU or product name
            </label>
            <div className="relative max-w-xl">
              <input
                id="staff-order-item-search"
                type="search"
                value={itemSearchQuery}
                onChange={(e) => {
                  setItemSearchQuery(e.target.value);
                  if (selectedItemId) {
                    setSelectedItemId("");
                    setItemDetail(null);
                  }
                }}
                placeholder={
                  inventoryLoading
                    ? "Loading inventory…"
                    : "Type SKU or product name…"
                }
                disabled={inventoryLoading || !!inventoryError}
                className={formFieldClassName}
                autoComplete="off"
              />
              {selectedItemId ? (
                <button
                  type="button"
                  onClick={handleClearSelectedItem}
                  className="mt-2 text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
                >
                  Clear selected item
                </button>
              ) : null}
              {!selectedItemId &&
              itemSearchQuery.trim() &&
              !inventoryLoading ? (
                <ul
                  className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
                  role="listbox"
                >
                  {itemSearchResults.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-slate-500">
                      No available items match your search.
                    </li>
                  ) : (
                    itemSearchResults.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          role="option"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-violet-50 dark:hover:bg-violet-950/40"
                          onClick={() => handleSelectSearchResult(item)}
                        >
                          <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                            {item.sku}
                          </span>
                          <span className="mt-0.5 block font-medium text-slate-900 dark:text-slate-100">
                            {item.productName || item.itemLabel}
                          </span>
                          <span className="text-xs text-slate-500">
                            {formatPhpDisplay(effectiveItemListPrice(item))}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </div>
            {inventoryError ? (
              <p
                className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                role="alert"
              >
                {inventoryError}
              </p>
            ) : null}
          </div>

          {itemDetailLoading ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Loading item details…
            </p>
          ) : null}

          {itemDetailError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {itemDetailError}
            </p>
          ) : null}

          {clientDetailLoading && !clientDetail ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Loading customer details…
            </p>
          ) : null}

          {itemDetail && selectedClient ? (
            <form
              className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              onSubmit={handleSubmitOrder}
            >
              {submitError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                  {submitError}
                </p>
              ) : null}

              {ownItemConflict ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  This item belongs to the selected customer. They cannot
                  purchase their own consigned item.
                </p>
              ) : null}

              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Order form
                </h2>
              </div>

              <DescriptionTable rows={descriptionRows} />
              <DescriptionTable rows={customerDetailsRows} />

              <label className="block">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Payment type
                </span>
                <select
                  value={paymentType}
                  onChange={(e) => {
                    const next = e.target.value as OrderPaymentType;
                    if (next === "layaway" && !layawayEligibility.allowed) {
                      return;
                    }
                    if (next === "credit_line" && !isCreditLine) {
                      return;
                    }
                    setPaymentType(next);
                    setOrderSignatureFile(null);
                    setSignatureFieldKey((k) => k + 1);
                    if (next !== "layaway" && next !== "credit_line") {
                      setLayawayTermsAccepted(false);
                      setLayawayTermsModalOpen(false);
                    }
                  }}
                  className={selectFieldClassName}
                  disabled={ownItemConflict}
                >
                  {paymentTypeOptions.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      disabled={
                        option.value === "layaway" &&
                        !layawayEligibility.allowed
                      }
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
                {!layawayEligibility.allowed ? (
                  <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                    {layawayEligibility.reasons.join(" ")}
                  </p>
                ) : null}
              </label>

              {isInstallmentPaymentType(paymentType) ? (
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      No. of months
                    </span>
                    <input
                      type="number"
                      min={MIN_LAYAWAY_MONTHS}
                      max={MAX_LAYAWAY_MONTHS}
                      step={1}
                      value={layawayMonths}
                      onChange={(e) =>
                        setLayawayMonths(clampLayawayMonths(e.target.value))
                      }
                      className={formFieldClassName}
                      disabled={ownItemConflict}
                    />
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Layaway is available for {MIN_LAYAWAY_MONTHS} to{" "}
                      {MAX_LAYAWAY_MONTHS} months only.
                    </p>
                    {layawayRateNote ? (
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {layawayRateNote}
                      </p>
                    ) : null}
                  </label>

                  <label className="block">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Layaway price
                    </span>
                    <input
                      type="text"
                      value={layawayPriceDisplay}
                      readOnly
                      className={readonlyFormFieldClassName}
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Monthly payment
                    </span>
                    <input
                      type="text"
                      value={monthlyPaymentDisplay}
                      readOnly
                      className={readonlyFormFieldClassName}
                    />
                  </label>

                  <div className="flex items-start gap-2 pt-1">
                    <input
                      id="staff-layaway-terms"
                      type="checkbox"
                      checked={layawayTermsAccepted}
                      onChange={(e) => {
                        if (!e.target.checked) {
                          setLayawayTermsAccepted(false);
                        }
                      }}
                      onClick={(e) => {
                        if (!layawayTermsAccepted) {
                          e.preventDefault();
                          setLayawayTermsModalOpen(true);
                        }
                      }}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                      disabled={ownItemConflict}
                    />
                    <label
                      htmlFor="staff-layaway-terms"
                      className="text-sm leading-snug text-slate-700 dark:text-slate-300"
                    >
                      The customer has read and agreed to the Layaway Terms and
                      Conditions.
                    </label>
                  </div>
                </div>
              ) : null}

              <OrderPickupFormFields
                values={pickupForm}
                onChange={setPickupForm}
                disabled={submitBusy || ownItemConflict}
                variant="staff"
              />

              <div className="flex items-start gap-2 pt-1">
                <input
                  id="staff-order-sales-contract-terms"
                  type="checkbox"
                  checked={orderTermsAccepted}
                  onChange={(e) => {
                    if (!e.target.checked) {
                      setOrderTermsAccepted(false);
                    }
                  }}
                  onClick={(e) => {
                    if (!orderTermsAccepted) {
                      e.preventDefault();
                      setOrderTermsModalOpen(true);
                    }
                  }}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                  disabled={ownItemConflict}
                />
                <label
                  htmlFor="staff-order-sales-contract-terms"
                  className="text-sm leading-snug text-slate-700 dark:text-slate-300"
                >
                  The customer has read and agreed to the Terms, Conditions, and
                  Sales Contract.
                </label>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Customer signature
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Capture the customer&apos;s signature or upload a clear image
                  of it.
                </p>
                <div className="mt-2">
                  <OfferSignatureField
                    key={signatureFieldKey}
                    onSignatureChange={setOrderSignatureFile}
                  />
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="submit"
                  disabled={!canSubmitOrder}
                  className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitBusy ? "Submitting…" : "Create order"}
                </button>
              </div>
            </form>
          ) : null}
        </>
      ) : null}

      <TermsScrollAgreeModal
        open={layawayTermsModalOpen}
        onClose={() => setLayawayTermsModalOpen(false)}
        onAgree={() => {
          setLayawayTermsAccepted(true);
          setLayawayTermsModalOpen(false);
        }}
        url={LAYAWAY_TERMS_URL}
        title="Layaway — terms and conditions"
      />

      <TermsScrollAgreeModal
        open={orderTermsModalOpen}
        onClose={() => setOrderTermsModalOpen(false)}
        onAgree={() => {
          setOrderTermsAccepted(true);
          setOrderTermsModalOpen(false);
        }}
        url={ORDER_SALES_CONTRACT_TERMS_URL}
        title="Terms, Conditions, and Sales Contract"
      />

      {photosModalOpen &&
      itemPhotos.length > 0 &&
      typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
              role="dialog"
              aria-modal="true"
              aria-labelledby={photosModalTitleId}
            >
              <button
                type="button"
                className="absolute inset-0 bg-slate-900/50"
                aria-label="Close photos"
                onClick={() => setPhotosModalOpen(false)}
              />
              <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-3">
                  <h2
                    id={photosModalTitleId}
                    className="text-base font-semibold text-slate-900 dark:text-slate-100"
                  >
                    Item photos
                  </h2>
                  <button
                    type="button"
                    onClick={() => setPhotosModalOpen(false)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                  >
                    Close
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {itemPhotos.map((photo) => (
                    <img
                      key={photo.key}
                      src={photo.url}
                      alt=""
                      className="aspect-square w-full rounded-xl bg-slate-100 object-cover dark:bg-slate-800"
                      loading="lazy"
                    />
                  ))}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
