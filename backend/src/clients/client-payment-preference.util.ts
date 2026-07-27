import { Client } from './entities/client.entity';

export type ClientBankCode = 'bdo' | 'bpi' | 'other';

export type ClientBankDetails = {
  accountNumber: string;
  accountName: string;
  bank: ClientBankCode;
};

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

export function isClientPaymentProfileReadyForOffer(
  client: Pick<
    Client,
    'preferredPaymentMethod' | 'preferredPaymentBranch' | 'bankAccountNumber' | 'bankAccountName' | 'bankCode'
  >,
): boolean {
  const method = client.preferredPaymentMethod;
  if (
    method !== 'check_pickup' &&
    method !== 'cash_pickup' &&
    method !== 'direct_deposit'
  ) {
    return false;
  }
  if (method === 'direct_deposit') {
    return hasCompleteBankDetails(client);
  }
  return (
    client.preferredPaymentBranch === 'pasig' ||
    client.preferredPaymentBranch === 'makati'
  );
}
