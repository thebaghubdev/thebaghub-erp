export const ACCESS_LEVELS = ['view', 'edit'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

/** Features managed via Access Management (not always-open). */
export const MANAGED_FEATURE_KEYS = [
  'add-inventory-item',
  'inquiries',
  'inquiry-assignment',
  'consignment-scheduling',
  'authentication',
  'photoshoot',
  'photoshoot-assignment',
  'pricing',
  'editing',
  'posting',
  'orders',
  'order-assignment',
  'payment-verification',
  'consignor-payments',
  'direct-purchase-payments',
  'walk-in-authentication',
  'promotions',
  'vouchers',
  'logistics',
  'employees',
  'clients',
  'settings',
  'task-management',
  'access-management',
] as const;

export type ManagedFeatureKey = (typeof MANAGED_FEATURE_KEYS)[number];

export const MANAGED_FEATURE_LABELS: Record<ManagedFeatureKey, string> = {
  'add-inventory-item': 'Add Inventory Item',
  inquiries: 'Consignment Inquiries',
  'inquiry-assignment': 'Inquiry Assignment',
  'consignment-scheduling': 'Consignment Scheduling',
  authentication: 'Authentication',
  photoshoot: 'Photoshoot',
  'photoshoot-assignment': 'Photoshoot Assignment',
  pricing: 'Pricing',
  editing: 'Editing',
  posting: 'Posting',
  orders: 'Orders',
  'order-assignment': 'Order Assignment',
  'payment-verification': 'Payment Verification',
  'consignor-payments': 'Consignor Payments',
  'direct-purchase-payments': 'Direct Purchase Payments',
  'walk-in-authentication': '3rd-Party Authentication',
  promotions: 'Promotions',
  vouchers: 'Credit Vouchers',
  logistics: 'Logistics',
  employees: 'Employees',
  clients: 'Clients',
  settings: 'Settings',
  'task-management': 'Task Management',
  'access-management': 'Access Management',
};

/** Managed features with a single grant (no view-only). Stored as edit access. */
export const SINGLE_GRANT_FEATURE_KEYS = [
  'task-management',
  'payment-verification',
  'photoshoot-assignment',
  'order-assignment',
  'inquiry-assignment',
] as const;

export function isSingleGrantFeature(key: string): boolean {
  return (SINGLE_GRANT_FEATURE_KEYS as readonly string[]).includes(key);
}

export function isManagedFeatureKey(key: string): key is ManagedFeatureKey {
  return (MANAGED_FEATURE_KEYS as readonly string[]).includes(key);
}

export function accessLevelSatisfies(
  actual: AccessLevel | null | undefined,
  required: AccessLevel,
): boolean {
  if (!actual) return false;
  if (required === 'view') return actual === 'view' || actual === 'edit';
  return actual === 'edit';
}
