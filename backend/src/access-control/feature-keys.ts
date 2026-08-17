export const ACCESS_LEVELS = ['view', 'edit'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

/** Features managed via Access Management (not always-open). */
export const MANAGED_FEATURE_KEYS = [
  'add-inventory-item',
  'inquiries',
  'consignment-scheduling',
  'authentication',
  'photoshoot',
  'pricing',
  'editing',
  'posting',
  'orders',
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
  'consignment-scheduling': 'Consignment Scheduling',
  authentication: 'Authentication',
  photoshoot: 'Photoshoot',
  pricing: 'Pricing',
  editing: 'Editing',
  posting: 'Posting',
  orders: 'Orders',
  'consignor-payments': 'Consignor Payments',
  'direct-purchase-payments': 'Direct Purchase Payments',
  'walk-in-authentication': 'Walk-in Authentication',
  promotions: 'Promotions',
  vouchers: 'Credit Vouchers',
  logistics: 'Logistics',
  employees: 'Employees',
  clients: 'Clients',
  settings: 'Settings',
  'task-management': 'Task Management',
  'access-management': 'Access Management',
};

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
