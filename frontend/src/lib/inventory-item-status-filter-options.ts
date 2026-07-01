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
  { value: "For Pricing", label: "For Pricing" },
  { value: "For Repricing", label: "For Repricing" },
  { value: "For Editing", label: "For Editing" },
  { value: "For Posting", label: "For Posting" },
  { value: "Available For Purchase", label: "Available For Purchase" },
  { value: "Out for delivery", label: "Out for delivery" },
  { value: "For Contract Renewal", label: "For Contract Renewal" },
  {
    value: "Authenticated: Requested for Reauthentication",
    label: "Authenticated: Requested for Reauthentication",
  },
  {
    value: "Authenticated: For 3rd party authentication",
    label: "Authenticated: For 3rd party authentication",
  },
  {
    value: "Authenticated: For renegotiation",
    label: "Authenticated: For renegotiation",
  },
  {
    value: "Authenticated: Rejected",
    label: "Authenticated: Rejected",
  },
];
