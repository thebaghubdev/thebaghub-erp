export type ThirdPartyAuthenticationData = {
  selectedAuthenticator: 'LegitGrails' | 'Entrupy' | null;
  certificateLink: string | null;
  notes: string | null;
};
