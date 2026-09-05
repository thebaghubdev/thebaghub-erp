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
  { value: "Reserved - Layaway", label: "Reserved - Layaway" },
  { value: "For pick-up", label: "For pick-up" },
  { value: "Sold under warranty", label: "Sold under warranty" },
  { value: "Sold final", label: "Sold final" },
  { value: "Paid to consignor", label: "Paid to consignor" },
  { value: "For Contract Renewal", label: "For Contract Renewal" },
  {
    value: "Authenticated - Returned to Coordinator",
    label: "Authenticated - Returned to Coordinator",
  },
  {
    value: "Authenticated - Returned to Consignor",
    label: "Authenticated - Returned to Consignor",
  },
  {
    value: "For authentication payment verification",
    label: "For authentication payment verification",
  },
  {
    value: "For 3rd party authentication",
    label: "For 3rd party authentication",
  },
  {
    value: "Authenticated: Rejected",
    label: "Authenticated: Rejected",
  },
];
