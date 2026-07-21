export const PICKUP_OPTION_STORE = 'store_pickup';
export const PICKUP_OPTION_COURIER = 'courier_delivery';
export const PICKUP_OPTION_IN_STORE = 'in_store_purchase';
export const PICKUP_OPTIONS = [
  PICKUP_OPTION_STORE,
  PICKUP_OPTION_COURIER,
  PICKUP_OPTION_IN_STORE,
] as const;

export const PICKUP_BRANCH_MAKATI = 'makati';
export const PICKUP_BRANCH_PASIG = 'pasig';
export const PICKUP_BRANCH_OPTIONS = [
  PICKUP_BRANCH_MAKATI,
  PICKUP_BRANCH_PASIG,
] as const;

export const COURIER_SERVICE_LBC = 'lbc';
export const COURIER_SERVICE_THIRD_PARTY = 'third_party';
export const COURIER_SERVICE_OPTIONS = [
  COURIER_SERVICE_LBC,
  COURIER_SERVICE_THIRD_PARTY,
] as const;
