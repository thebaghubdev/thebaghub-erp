export const ACCESS_LEVELS = ['view', 'edit'] as const
export type AccessLevel = (typeof ACCESS_LEVELS)[number]

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
] as const

export type ManagedFeatureKey = (typeof MANAGED_FEATURE_KEYS)[number]

export const ALWAYS_OPEN_FEATURE_KEYS = [
  'taskboard',
  'dashboards',
  'inventory',
] as const
export type AlwaysOpenFeatureKey = (typeof ALWAYS_OPEN_FEATURE_KEYS)[number]

export type FeatureKey = ManagedFeatureKey | AlwaysOpenFeatureKey

export type FeatureAccessMap = Partial<Record<ManagedFeatureKey, AccessLevel>>

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
  'payment-verification': 'Payment Verification',
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
}

/** Managed features with a single grant (no view-only). Stored as edit access. */
export const SINGLE_GRANT_FEATURE_KEYS = [
  'task-management',
  'payment-verification',
] as const

export const SINGLE_GRANT_FEATURE_LABELS: Record<
  (typeof SINGLE_GRANT_FEATURE_KEYS)[number],
  string
> = {
  'task-management':
    "Staff who can view others' boards and create tasks for them",
  'payment-verification': 'Staff who can confirm proofs of payment',
}

export function isSingleGrantFeature(key: ManagedFeatureKey): boolean {
  return (SINGLE_GRANT_FEATURE_KEYS as readonly string[]).includes(key)
}

export type PortalNavItem = {
  key: FeatureKey
  label: string
  to: string
  alwaysVisible?: boolean
  end?: boolean
}

export const PORTAL_NAV_ITEMS: PortalNavItem[] = [
  { key: 'taskboard', label: 'Taskboard', to: '/portal/taskboard', alwaysVisible: true, end: true },
  { key: 'dashboards', label: 'Dashboards', to: '/portal/dashboards', alwaysVisible: true, end: true },
  { key: 'inventory', label: 'Inventory', to: '/portal/inventory', alwaysVisible: true },
  { key: 'inquiries', label: 'Consignment Inquiries', to: '/portal/inquiries' },
  { key: 'consignment-scheduling', label: 'Consignment Scheduling', to: '/portal/consignment-scheduling' },
  { key: 'authentication', label: 'Authentication', to: '/portal/authentication' },
  { key: 'photoshoot', label: 'Photoshoot', to: '/portal/photoshoot' },
  { key: 'pricing', label: 'Pricing', to: '/portal/pricing', end: true },
  { key: 'editing', label: 'Editing', to: '/portal/editing', end: true },
  { key: 'posting', label: 'Posting', to: '/portal/posting', end: true },
  { key: 'orders', label: 'Orders', to: '/portal/orders', end: true },
  { key: 'consignor-payments', label: 'Consignor Payments', to: '/portal/consignor-payments', end: true },
  { key: 'direct-purchase-payments', label: 'Direct Purchase Payments', to: '/portal/direct-purchase-payments', end: true },
  { key: 'walk-in-authentication', label: 'Walk-in Authentication', to: '/portal/walk-in-authentication' },
  { key: 'promotions', label: 'Promotions', to: '/portal/promotions', end: true },
  { key: 'vouchers', label: 'Credit Vouchers', to: '/portal/vouchers', end: true },
  { key: 'logistics', label: 'Logistics', to: '/portal/logistics', end: true },
  { key: 'employees', label: 'Employees', to: '/portal/employees' },
  { key: 'clients', label: 'Clients', to: '/portal/clients' },
  { key: 'settings', label: 'Settings', to: '/portal/settings' },
  { key: 'access-management', label: 'Access Management', to: '/portal/access-management' },
]

function isAlwaysOpen(key: FeatureKey): key is AlwaysOpenFeatureKey {
  return (ALWAYS_OPEN_FEATURE_KEYS as readonly string[]).includes(key)
}

function isManaged(key: FeatureKey): key is ManagedFeatureKey {
  return (MANAGED_FEATURE_KEYS as readonly string[]).includes(key)
}

export function canViewFeature(
  isAdmin: boolean | undefined,
  grants: FeatureAccessMap | null | undefined,
  key: FeatureKey,
): boolean {
  if (isAdmin) return true
  if (isAlwaysOpen(key)) return true
  if (!isManaged(key)) return false
  const level = grants?.[key]
  return level === 'view' || level === 'edit'
}

export function canEditFeature(
  isAdmin: boolean | undefined,
  grants: FeatureAccessMap | null | undefined,
  key: FeatureKey,
): boolean {
  if (isAdmin) return true
  if (isAlwaysOpen(key)) return true
  if (!isManaged(key)) return false
  return grants?.[key] === 'edit'
}
