import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { useClientAuth } from "../context/client-auth";
import { apiFetch } from "../lib/api";

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

  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [branch, setBranch] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const openBankModal = useCallback(() => {
    if (!c) return;
    setAccountNumber(c.bankAccountNumber ?? "");
    setAccountName(c.bankAccountName ?? "");
    setBankCode(
      c.bankCode === "bdo" || c.bankCode === "bpi" || c.bankCode === "other"
        ? c.bankCode
        : "",
    );
    setBranch(c.bankBranch ?? "");
    setSaveError(null);
    setBankModalOpen(true);
  }, [c]);

  const closeBankModal = useCallback(() => {
    setBankModalOpen(false);
    setSaveError(null);
  }, []);

  useEffect(() => {
    if (!bankModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saveBusy) closeBankModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bankModalOpen, saveBusy, closeBankModal]);

  const onSubmitBank = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
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
            bankBranch: branch,
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

  const displayOrDash = (v: string | null | undefined) => {
    const t = v?.trim();
    return t ? t : "—";
  };

  return (
    <div className="space-y-4">
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
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Branch
            </dt>
            <dd className="mt-0.5 text-slate-900">
              {displayOrDash(c?.bankBranch)}
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
              <div>
                <label
                  htmlFor="bank-branch-modal"
                  className="block text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  Branch
                </label>
                <input
                  id="bank-branch-modal"
                  type="text"
                  autoComplete="off"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
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
    </div>
  );
}
