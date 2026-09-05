export type AuthenticationReturnCase =
  | "for_renegotiation"
  | "for_3rd_party_authentication"
  | "for_3rd_party_with_renegotiation";

export function authenticationReturnCaseHasRenegotiation(
  value: string | null | undefined,
): boolean {
  return (
    value === "for_renegotiation" ||
    value === "for_3rd_party_with_renegotiation"
  );
}

export function authenticationReturnCaseHasThirdParty(
  value: string | null | undefined,
): boolean {
  return (
    value === "for_3rd_party_authentication" ||
    value === "for_3rd_party_with_renegotiation"
  );
}

export function authenticationReturnCaseLabel(
  value: string | null | undefined,
): string {
  if (value === "for_renegotiation") return "For Renegotiation";
  if (value === "for_3rd_party_authentication") {
    return "For 3rd-party authentication";
  }
  if (value === "for_3rd_party_with_renegotiation") {
    return "For 3rd-party with renegotiation";
  }
  return "—";
}
