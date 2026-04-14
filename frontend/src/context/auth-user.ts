export type ClientProfile = {
  firstName: string
  lastName: string
  email: string
  contactNumber: string
  bankAccountNumber: string | null
  bankAccountName: string | null
  bankCode: string | null
  bankBranch: string | null
}

export type AuthUser = {
  id: string
  username: string
  userType: string
  isAdmin: boolean
  employee: {
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
    bankAccountNumber: raw.bankAccountNumber ?? null,
    bankAccountName: raw.bankAccountName ?? null,
    bankCode: raw.bankCode ?? null,
    bankBranch: raw.bankBranch ?? null,
  }
}
