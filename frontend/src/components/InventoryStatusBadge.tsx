import { inventoryStatusBadgeClassName } from "../lib/inventory-status-badge";

const baseClass = "font-medium";

type Props = {
  status: string;
  className?: string;
};

export function InventoryStatusBadge({ status, className = "" }: Props) {
  return (
    <span
      className={`${baseClass} ${inventoryStatusBadgeClassName(status)} ${className}`.trim()}
    >
      {status}
    </span>
  );
}
