/**
 * Inventory item `status` strings used in workflows (`inventory.service.ts`).
 * Labels match cell display (`InventoryStatusBadge`).
 */
export const INVENTORY_ITEM_STATUS_FILTER_OPTIONS: {
  value: string;
  label: string;
}[] = [
  { value: "For Authentication", label: "For Authentication" },
  { value: "For Photoshoot", label: "For Photoshoot" },
  {
    value: "Authenticated: For 3rd party authentication",
    label: "Authenticated: For 3rd party authentication",
  },
  {
    value: "Authenticated: For renegotiation",
    label: "Authenticated: For renegotiation",
  },
  {
    value: "Authentication Rejected",
    label: "Authentication Rejected",
  },
];
