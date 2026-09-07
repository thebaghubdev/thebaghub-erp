import { BANK_TRANSFER_ACCOUNT_DETAILS } from "../lib/order-payments";

export function BankTransferPaymentInstructions() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">
        Bank transfer payment
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Transfer to any of the accounts below, then upload your proof of
        payment.
      </p>
      <ul className="mt-4 space-y-3">
        {BANK_TRANSFER_ACCOUNT_DETAILS.map((account) => (
          <li
            key={account.label}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
          >
            <p className="text-sm font-semibold text-slate-900">
              {account.label}
            </p>
            <p className="mt-0.5 text-sm text-slate-700">{account.accountName}</p>
            <p className="mt-0.5 font-mono text-sm tabular-nums tracking-wide text-slate-900">
              {account.accountNumber}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
