import type { ClientProfile } from "../context/auth-user";

export type ClientPaymentMethod =
  | "check_pickup"
  | "cash_pickup"
  | "direct_deposit";

export type ClientPaymentBranch = "pasig" | "makati";

export type ClientBankCode = "bdo" | "bpi" | "other";

export type ClientBankDetails = {
  accountNumber: string;
  accountName: string;
  bank: ClientBankCode;
};

export function formatClientPaymentMethod(
  m: ClientPaymentMethod | null | undefined,
): string {
  if (m === "check_pickup") return "Check pickup";
  if (m === "cash_pickup") return "Cash pickup";
  if (m === "direct_deposit") return "Direct deposit";
  return "—";
}

export function parseClientPaymentMethod(
  value: string | null | undefined,
): ClientPaymentMethod | null {
  if (
    value === "check_pickup" ||
    value === "cash_pickup" ||
    value === "direct_deposit"
  ) {
    return value;
  }
  return null;
}

export function parseClientPaymentBranch(
  value: string | null | undefined,
): ClientPaymentBranch {
  return value === "makati" ? "makati" : "pasig";
}

export function isClientPaymentProfileReadyForOffer(
  client: Pick<
    ClientProfile,
    | "preferredPaymentMethod"
    | "preferredPaymentBranch"
    | "bankAccountNumber"
    | "bankAccountName"
    | "bankCode"
  > | null | undefined,
): boolean {
  const method = parseClientPaymentMethod(client?.preferredPaymentMethod);
  if (!method) return false;
  if (method === "direct_deposit") {
    return hasCompleteClientBankDetails(client);
  }
  return (
    client?.preferredPaymentBranch === "pasig" ||
    client?.preferredPaymentBranch === "makati"
  );
}

export function hasCompleteClientBankDetails(
  client: Pick<
    ClientProfile,
    "bankAccountNumber" | "bankAccountName" | "bankCode"
  > | null | undefined,
): boolean {
  return bankDetailsFromClientProfile(client) != null;
}

export function bankDetailsFromClientProfile(
  client: Pick<
    ClientProfile,
    "bankAccountNumber" | "bankAccountName" | "bankCode"
  > | null | undefined,
): ClientBankDetails | null {
  if (!client) return null;
  const bank = client.bankCode;
  if (bank !== "bdo" && bank !== "bpi" && bank !== "other") return null;
  const accountNumber = (client.bankAccountNumber ?? "").trim();
  const accountName = (client.bankAccountName ?? "").trim();
  if (!accountNumber || !accountName) return null;
  return { bank, accountNumber, accountName };
}

export function formatClientBank(code: ClientBankCode): string {
  if (code === "bdo") return "BDO";
  if (code === "bpi") return "BPI";
  return "Other";
}

export type ClientVipStatus = "Regular" | "Gold" | "Diamond";

export const CLIENT_VIP_STATUS_OPTIONS: ClientVipStatus[] = [
  "Regular",
  "Gold",
  "Diamond",
];

export function formatClientVipStatus(
  status: ClientVipStatus | null | undefined,
): ClientVipStatus {
  if (status === "Gold" || status === "Diamond") return status;
  return "Regular";
}

const VIP_STATUS_BADGE_CLASS: Record<ClientVipStatus, string> = {
  Regular:
    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Gold: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  Diamond:
    "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200",
};

export function clientVipStatusBadgeClassName(
  status: ClientVipStatus | null | undefined,
): string {
  const label = formatClientVipStatus(status);
  return VIP_STATUS_BADGE_CLASS[label];
}
