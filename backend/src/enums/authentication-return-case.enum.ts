/** Why an authenticator returned an item to the assigned coordinator. */
export enum AuthenticationReturnCase {
  FOR_RENEGOTIATION = 'for_renegotiation',
  FOR_3RD_PARTY_AUTHENTICATION = 'for_3rd_party_authentication',
  FOR_3RD_PARTY_WITH_RENEGOTIATION = 'for_3rd_party_with_renegotiation',
}

export function authenticationReturnCaseHasRenegotiation(
  value: string | null | undefined,
): boolean {
  return (
    value === AuthenticationReturnCase.FOR_RENEGOTIATION ||
    value === AuthenticationReturnCase.FOR_3RD_PARTY_WITH_RENEGOTIATION
  );
}

export function authenticationReturnCaseHasThirdParty(
  value: string | null | undefined,
): boolean {
  return (
    value === AuthenticationReturnCase.FOR_3RD_PARTY_AUTHENTICATION ||
    value === AuthenticationReturnCase.FOR_3RD_PARTY_WITH_RENEGOTIATION
  );
}

export function authenticationReturnCaseLabel(
  value: string | null | undefined,
): string {
  if (value === AuthenticationReturnCase.FOR_RENEGOTIATION) {
    return 'For Renegotiation';
  }
  if (value === AuthenticationReturnCase.FOR_3RD_PARTY_AUTHENTICATION) {
    return 'For 3rd-party authentication';
  }
  if (value === AuthenticationReturnCase.FOR_3RD_PARTY_WITH_RENEGOTIATION) {
    return 'For 3rd-party with renegotiation';
  }
  return '—';
}
