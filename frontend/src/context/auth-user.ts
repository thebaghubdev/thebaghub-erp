export type ClientProfile = {
  firstName: string
  lastName: string
  email: string
  contactNumber: string
  completeAddress: string | null
  bankAccountNumber: string | null
  bankAccountName: string | null
  bankCode: string | null
  bankBranch: string | null
  preferredPaymentMethod:
    | 'check_pickup'
    | 'cash_pickup'
    | 'direct_deposit'
    | null
  preferredPaymentBranch: 'pasig' | 'makati' | null
}

export type AuthUser = {
  id: string
  username: string
  userType: string
  isAdmin: boolean
  employee: {
    /** Employee row id; may be absent until next login after API update. */
    id?: string
    firstName: string
    lastName: string
    position: string
  } | null
  client: ClientProfile | null
}

export function normalizeClientProfile(
  raw: Partial<ClientProfile> | null | undefined,
): ClientProfile | null {
  if (!raw) return null
  return {
    firstName: raw.firstName ?? '',
    lastName: raw.lastName ?? '',
    email: raw.email ?? '',
    contactNumber: raw.contactNumber ?? '',
    completeAddress: raw.completeAddress ?? null,
    bankAccountNumber: raw.bankAccountNumber ?? null,
    bankAccountName: raw.bankAccountName ?? null,
    bankCode: raw.bankCode ?? null,
    bankBranch: raw.bankBranch ?? null,
    preferredPaymentMethod:
      raw.preferredPaymentMethod === 'check_pickup' ||
      raw.preferredPaymentMethod === 'cash_pickup' ||
      raw.preferredPaymentMethod === 'direct_deposit'
        ? raw.preferredPaymentMethod
        : null,
    preferredPaymentBranch:
      raw.preferredPaymentBranch === 'pasig' ||
      raw.preferredPaymentBranch === 'makati'
        ? raw.preferredPaymentBranch
        : null,
  }
}
