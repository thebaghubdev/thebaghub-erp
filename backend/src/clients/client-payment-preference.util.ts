import { Client } from './entities/client.entity';

export const CLIENT_PAYMENT_PREFERENCE_LOCKED_MESSAGE =
  'Payment and bank details cannot be changed after they are set. Please contact our coordinators if you need to update them.';

export type ClientBankCode = 'bdo' | 'bpi' | 'other';

export type ClientBankDetails = {
  accountNumber: string;
  accountName: string;
  bank: ClientBankCode;
};

export function isClientPaymentPreferenceLocked(
  client: Pick<Client, 'preferredPaymentMethod'>,
): boolean {
  return client.preferredPaymentMethod != null;
}

export function hasCompleteBankDetails(
  client: Pick<
    Client,
    'bankAccountNumber' | 'bankAccountName' | 'bankCode'
  >,
): boolean {
  return extractBankDetailsFromClient(client) != null;
}

export function extractBankDetailsFromClient(
  client: Pick<
    Client,
    'bankAccountNumber' | 'bankAccountName' | 'bankCode'
  >,
): ClientBankDetails | null {
  const bank = client.bankCode?.trim();
  if (bank !== 'bdo' && bank !== 'bpi' && bank !== 'other') {
    return null;
  }
  const accountNumber = client.bankAccountNumber?.trim() ?? '';
  const accountName = client.bankAccountName?.trim() ?? '';
  if (!accountNumber || !accountName) {
    return null;
  }
  return {
    accountNumber,
    accountName,
    bank,
  };
}

export function touchesBankFields(dto: {
  bankAccountNumber?: string;
  bankAccountName?: string;
  bankCode?: string;
}): boolean {
  return (
    dto.bankAccountNumber !== undefined ||
    dto.bankAccountName !== undefined ||
    dto.bankCode !== undefined
  );
}

export function touchesPaymentFields(dto: {
  preferredPaymentMethod?: string;
  preferredPaymentBranch?: string;
}): boolean {
  return (
    dto.preferredPaymentMethod !== undefined ||
    dto.preferredPaymentBranch !== undefined
  );
}
