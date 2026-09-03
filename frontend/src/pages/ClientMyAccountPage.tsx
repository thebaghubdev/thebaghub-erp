import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { useClientAuth } from "../context/client-auth";
import { useUnsavedChangesGuard } from "../context/unsaved-changes";
import { apiFetch } from "../lib/api";
import { branchLabel } from "../lib/consignment-schedule-labels";
import {
  clientVipStatusBadgeClassName,
  formatClientPaymentMethod,
  formatClientVipStatus,
  hasCompleteClientBankDetails,
  parseClientPaymentBranch,
  parseClientPaymentMethod,
  type ClientPaymentMethod,
} from "../lib/client-payment-preference";
import { formatPhpDisplay } from "../lib/format-php";
import {
  formatVoucherDate,
  formatVoucherNumberDisplay,
  voucherStatusBadgeClass,
  voucherStatusLabel,
} from "../lib/vouchers-display";

type ClientVoucherRow = {
  id: string;
  voucherNumber: number | null;
  amount: string;
  expirationDate: string;
  status: string;
  createdAt: string;
};

function bankDisplayName(code: string | null | undefined): string {
  if (code === "bdo") return "BDO";
  if (code === "bpi") return "BPI";
  if (code === "other") return "Other";
  return "—";
}

export function ClientMyAccountPage() {
  const { user, token, refreshUser } = useClientAuth();
  const c = user?.client;

  const bankModalTitleId = useId();
  const addressModalTitleId = useId();
  const paymentModalTitleId = useId();

  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [completeAddress, setCompleteAddress] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<ClientPaymentMethod>("check_pickup");
  const [paymentBranch, setPaymentBranch] = useState<"pasig" | "makati">(
    "pasig",
  );
  const [saveBusy, setSaveBusy] = useState(false);
  const [addressSaveBusy, setAddressSaveBusy] = useState(false);
  const [paymentSaveBusy, setPaymentSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [addressSaveError, setAddressSaveError] = useState<string | null>(
    null,
  );
  const [paymentSaveError, setPaymentSaveError] = useState<string | null>(
    null,
  );
  const [vouchers, setVouchers] = useState<ClientVoucherRow[]>([]);
  const [vouchersLoading, setVouchersLoading] = useState(false);
  const [vouchersError, setVouchersError] = useState<string | null>(null);

  const loadVouchers = useCallback(async () => {
    if (!token) return;
    setVouchersError(null);
    setVouchersLoading(true);
    try {
      const res = await apiFetch("/api/client/vouchers", {}, token);
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }
      const data = (await res.json()) as ClientVoucherRow[];
      setVouchers(data);
    } catch (e) {
      setVouchers([]);
      setVouchersError(
        e instanceof Error ? e.message : "Failed to load credit vouchers",
      );
    } finally {
      setVouchersLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadVouchers();
  }, [loadVouchers]);

  const activeVoucherTotal = useMemo(() => {
    return vouchers
      .filter((v) => v.status.trim().toLowerCase() === "active")
      .reduce((sum, v) => {
        const n = Number(v.amount);
        return Number.isFinite(n) ? sum + n : sum;
      }, 0);
  }, [vouchers]);

  const openBankModal = useCallback(() => {
    if (!c) return;
    setAccountNumber(c.bankAccountNumber ?? "");
    setAccountName(c.bankAccountName ?? "");
    setBankCode(
      c.bankCode === "bdo" || c.bankCode === "bpi" || c.bankCode === "other"
        ? c.bankCode
        : "",
    );
    setSaveError(null);
    setBankModalOpen(true);
  }, [c]);

  const closeBankModal = useCallback(() => {
    setBankModalOpen(false);
    setSaveError(null);
  }, []);

  const openAddressModal = useCallback(() => {
    if (!c) return;
    setCompleteAddress(c.completeAddress ?? "");
    setAddressSaveError(null);
    setAddressModalOpen(true);
  }, [c]);

  const closeAddressModal = useCallback(() => {
    setAddressModalOpen(false);
    setAddressSaveError(null);
  }, []);

  const openPaymentModal = useCallback(() => {
    if (!c) return;
    setPaymentMethod(
      parseClientPaymentMethod(c.preferredPaymentMethod) ?? "check_pickup",
    );
    setPaymentBranch(parseClientPaymentBranch(c.preferredPaymentBranch));
    setPaymentSaveError(null);
    setPaymentModalOpen(true);
  }, [c]);

  const closePaymentModal = useCallback(() => {
    setPaymentModalOpen(false);
    setPaymentSaveError(null);
  }, []);

  const accountFormsDirty = Boolean(
    (bankModalOpen &&
      c &&
      (accountNumber !== (c.bankAccountNumber ?? "") ||
        accountName !== (c.bankAccountName ?? "") ||
        bankCode !==
          (c.bankCode === "bdo" || c.bankCode === "bpi" || c.bankCode === "other"
            ? c.bankCode
            : ""))) ||
      (addressModalOpen &&
        c &&
        completeAddress !== (c.completeAddress ?? "")) ||
      (paymentModalOpen &&
        c &&
        (paymentMethod !==
          (parseClientPaymentMethod(c.preferredPaymentMethod) ??
            "check_pickup") ||
          paymentBranch !==
            parseClientPaymentBranch(c.preferredPaymentBranch))),
  );

  useUnsavedChangesGuard({
    isDirty: accountFormsDirty,
    bypass: saveBusy || addressSaveBusy || paymentSaveBusy,
    description:
      "You have unsaved changes to your account. Leave this page?",
  });

  useEffect(() => {
    if (!bankModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saveBusy) closeBankModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bankModalOpen, saveBusy, closeBankModal]);

  useEffect(() => {
    if (!addressModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !addressSaveBusy) closeAddressModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addressModalOpen, addressSaveBusy, closeAddressModal]);

  useEffect(() => {
    if (!paymentModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !paymentSaveBusy) closePaymentModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paymentModalOpen, paymentSaveBusy, closePaymentModal]);

  const displayOrDash = (v: string | null | undefined) => {
    const t = v?.trim();
    return t ? t : "—";
  };

  const onSubmitBank = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (
      !bankCode.trim() ||
      !accountNumber.trim() ||
      !accountName.trim()
    ) {
      setSaveError(
        "All bank fields are required: bank, account number, and account name.",
      );
      return;
    }
    setSaveError(null);
    setSaveBusy(true);
    try {
      const res = await apiFetch(
        "/api/client/profile",
        {
          method: "PATCH",
          body: JSON.stringify({
            bankAccountNumber: accountNumber,
            bankAccountName: accountName,
            bankCode: bankCode.trim() === "" ? "" : bankCode,
          }),
        },
        token,
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        const msg = Array.isArray(body?.message)
          ? body.message.join(", ")
          : body?.message;
        setSaveError(msg ?? `Could not save (${res.status})`);
        return;
      }
      await refreshUser();
      closeBankModal();
    } catch {
      setSaveError("Could not save. Try again.");
    } finally {
      setSaveBusy(false);
    }
  };

  const onSubmitAddress = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setAddressSaveError(null);
    setAddressSaveBusy(true);
    try {
      const res = await apiFetch(
        "/api/client/profile",
        {
          method: "PATCH",
          body: JSON.stringify({
            completeAddress: completeAddress.trim(),
          }),
        },
        token,
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        const msg = Array.isArray(body?.message)
          ? body.message.join(", ")
          : body?.message;
        setAddressSaveError(msg ?? `Could not save (${res.status})`);
        return;
      }
      await refreshUser();
      closeAddressModal();
    } catch {
      setAddressSaveError("Could not save. Try again.");
    } finally {
      setAddressSaveBusy(false);
    }
  };

  const onSubmitPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (
      paymentMethod === "direct_deposit" &&
      !hasCompleteClientBankDetails(c)
    ) {
      setPaymentSaveError(
        "Complete your bank details before selecting direct deposit.",
      );
      return;
    }
    setPaymentSaveError(null);
    setPaymentSaveBusy(true);
    try {
      const payload: Record<string, unknown> = {
        preferredPaymentMethod: paymentMethod,
      };
      if (paymentMethod !== "direct_deposit") {
        payload.preferredPaymentBranch = paymentBranch;
      }
      const res = await apiFetch(
        "/api/client/profile",
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
        token,
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        const msg = Array.isArray(body?.message)
          ? body.message.join(", ")
          : body?.message;
        setPaymentSaveError(msg ?? `Could not save (${res.status})`);
        return;
      }
      await refreshUser();
      closePaymentModal();
    } catch {
      setPaymentSaveError("Could not save. Try again.");
    } finally {
      setPaymentSaveBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">My profile</h1>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <dl className="space-y-3 text-sm">
          {c && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Name
              </dt>
              <dd className="mt-0.5 text-slate-900">
                {c.firstName} {c.lastName}
              </dd>
            </div>
          )}
          {c?.contactNumber ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Contact number
              </dt>
              <dd className="mt-0.5 text-slate-900">{c.contactNumber}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Email
            </dt>
            <dd className="mt-0.5 break-all font-medium text-slate-900">
              {c?.email ?? user?.username}
            </dd>
            <p className="mt-1 text-xs text-slate-500">
              Used to sign in (your account username).
            </p>
          </div>
        </dl>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">VIP & activity</h2>
        <p className="mt-1 text-xs text-slate-500">
          Your VIP tier and cumulative consignment and purchase totals.
        </p>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              VIP status
            </dt>
            <dd className="mt-0.5">
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${clientVipStatusBadgeClassName(c?.vipStatus)}`}
              >
                {formatClientVipStatus(c?.vipStatus)}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Total consignments
            </dt>
            <dd className="mt-0.5 text-slate-900">
              {formatPhpDisplay(c?.totalConsignments ?? 0)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Total purchases
            </dt>
            <dd className="mt-0.5 text-slate-900">
              {formatPhpDisplay(c?.totalPurchases ?? 0)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Credit vouchers</h2>
        <p className="mt-1 text-xs text-slate-500">
          Credit vouchers issued to your account. Active balance:{" "}
          {formatPhpDisplay(activeVoucherTotal)}
        </p>
        {vouchersError ? (
          <p className="mt-4 text-sm text-red-600" role="alert">
            {vouchersError}
          </p>
        ) : vouchersLoading ? (
          <p className="mt-4 text-sm text-slate-500">Loading vouchers…</p>
        ) : vouchers.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No credit vouchers yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2 pr-4">Voucher #</th>
                  <th className="px-2 py-2 pr-4">Amount</th>
                  <th className="px-2 py-2 pr-4">Expiration</th>
                  <th className="px-2 py-2 pr-4">Status</th>
                  <th className="px-2 py-2">Issued</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map((voucher) => (
                  <tr
                    key={voucher.id}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="px-2 py-3 pr-4 font-medium tabular-nums text-slate-900">
                      {formatVoucherNumberDisplay(voucher.voucherNumber)}
                    </td>
                    <td className="px-2 py-3 pr-4 font-medium text-slate-900">
                      {formatPhpDisplay(voucher.amount)}
                    </td>
                    <td className="px-2 py-3 pr-4 text-slate-900">
                      {formatVoucherDate(voucher.expirationDate)}
                    </td>
                    <td className="px-2 py-3 pr-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${voucherStatusBadgeClass(voucher.status)}`}
                      >
                        {voucherStatusLabel(voucher.status)}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-slate-600">
                      {new Date(voucher.createdAt).toLocaleDateString(
                        undefined,
                        {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        },
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Complete address
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Used for order requests and deliveries.
            </p>
          </div>
          <button
            type="button"
            onClick={openAddressModal}
            disabled={!c || !token}
            className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Edit
          </button>
        </div>

        <p className="mt-4 whitespace-pre-wrap text-sm text-slate-900">
          {displayOrDash(c?.completeAddress)}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Preferred payment method
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Used when you sign consignment contracts and for consignor
              payouts.
            </p>
          </div>
          <button
            type="button"
            onClick={openPaymentModal}
            disabled={!c || !token}
            className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Edit
          </button>
        </div>

        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Payment method
            </dt>
            <dd className="mt-0.5 text-slate-900">
              {formatClientPaymentMethod(c?.preferredPaymentMethod)}
            </dd>
          </div>
          {c?.preferredPaymentMethod &&
          c.preferredPaymentMethod !== "direct_deposit" ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Pickup branch
              </dt>
              <dd className="mt-0.5 text-slate-900">
                {branchLabel(c.preferredPaymentBranch ?? "pasig")}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Bank details (direct deposit)
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Saved for consignment payments with direct deposit.
            </p>
          </div>
          <button
            type="button"
            onClick={openBankModal}
            disabled={!c || !token}
            className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Edit
          </button>
        </div>

        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Bank
            </dt>
            <dd className="mt-0.5 text-slate-900">
              {bankDisplayName(c?.bankCode ?? null)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Account number
            </dt>
            <dd className="mt-0.5 text-slate-900">
              {displayOrDash(c?.bankAccountNumber)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Account name
            </dt>
            <dd className="mt-0.5 text-slate-900">
              {displayOrDash(c?.bankAccountName)}
            </dd>
          </div>
        </dl>
      </div>

      {bankModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal
          aria-labelledby={bankModalTitleId}
          onClick={() => {
            if (!saveBusy) closeBankModal();
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id={bankModalTitleId}
              className="text-base font-semibold text-slate-900"
            >
              Edit bank details
            </h3>

            <form onSubmit={onSubmitBank} className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor="bank-code-modal"
                  className="block text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  Bank
                </label>
                <select
                  id="bank-code-modal"
                  value={bankCode}
                  onChange={(e) => setBankCode(e.target.value)}
                  disabled={saveBusy}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 focus:ring-2 disabled:opacity-50"
                >
                  <option value="">— Select bank —</option>
                  <option value="bdo">BDO</option>
                  <option value="bpi">BPI</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="bank-account-number-modal"
                  className="block text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  Account number
                </label>
                <input
                  id="bank-account-number-modal"
                  type="text"
                  autoComplete="off"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  disabled={saveBusy}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 focus:ring-2 disabled:opacity-50"
                />
              </div>
              <div>
                <label
                  htmlFor="bank-account-name-modal"
                  className="block text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  Account name
                </label>
                <input
                  id="bank-account-name-modal"
                  type="text"
                  autoComplete="name"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  disabled={saveBusy}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 focus:ring-2 disabled:opacity-50"
                />
              </div>

              {saveError ? (
                <p className="text-sm text-red-600" role="alert">
                  {saveError}
                </p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeBankModal}
                  disabled={saveBusy}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveBusy || !token}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saveBusy ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {paymentModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal
          aria-labelledby={paymentModalTitleId}
          onClick={() => {
            if (!paymentSaveBusy) closePaymentModal();
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id={paymentModalTitleId}
              className="text-base font-semibold text-slate-900"
            >
              Edit preferred payment
            </h3>

            <form onSubmit={onSubmitPayment} className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor="preferred-payment-method-modal"
                  className="block text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  Payment method
                </label>
                <select
                  id="preferred-payment-method-modal"
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as ClientPaymentMethod)
                  }
                  disabled={paymentSaveBusy}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 focus:ring-2 disabled:opacity-50"
                >
                  <option value="check_pickup">Check pickup</option>
                  <option value="cash_pickup">Cash pickup</option>
                  <option value="direct_deposit">Direct deposit</option>
                </select>
              </div>

              {paymentMethod !== "direct_deposit" ? (
                <div>
                  <label
                    htmlFor="preferred-payment-branch-modal"
                    className="block text-xs font-medium uppercase tracking-wide text-slate-500"
                  >
                    Pickup branch
                  </label>
                  <select
                    id="preferred-payment-branch-modal"
                    value={paymentBranch}
                    onChange={(e) =>
                      setPaymentBranch(
                        e.target.value as typeof paymentBranch,
                      )
                    }
                    disabled={paymentSaveBusy}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 focus:ring-2 disabled:opacity-50"
                  >
                    <option value="pasig">Pasig</option>
                    <option value="makati">Makati</option>
                  </select>
                </div>
              ) : (
                <p className="text-sm text-slate-600">
                  Direct deposit uses your saved bank details below.
                </p>
              )}

              {paymentSaveError ? (
                <p className="text-sm text-red-600" role="alert">
                  {paymentSaveError}
                </p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closePaymentModal}
                  disabled={paymentSaveBusy}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paymentSaveBusy || !token}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {paymentSaveBusy ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {addressModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal
          aria-labelledby={addressModalTitleId}
          onClick={() => {
            if (!addressSaveBusy) closeAddressModal();
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id={addressModalTitleId}
              className="text-base font-semibold text-slate-900"
            >
              Edit complete address
            </h3>

            <form onSubmit={onSubmitAddress} className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor="complete-address-modal"
                  className="block text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  Complete address
                </label>
                <textarea
                  id="complete-address-modal"
                  value={completeAddress}
                  onChange={(e) => setCompleteAddress(e.target.value)}
                  disabled={addressSaveBusy}
                  required
                  rows={4}
                  autoComplete="street-address"
                  className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 focus:ring-2 disabled:opacity-50"
                />
              </div>

              {addressSaveError ? (
                <p className="text-sm text-red-600" role="alert">
                  {addressSaveError}
                </p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeAddressModal}
                  disabled={addressSaveBusy}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addressSaveBusy || !token}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {addressSaveBusy ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
