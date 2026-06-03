import { orderStatusBadgeClassName } from "../lib/order-status-badge";

const baseClass = "font-medium";

type Props = {
  status: string;
  className?: string;
};

export function OrderStatusBadge({ status, className = "" }: Props) {
  return (
    <span
      className={`${baseClass} ${orderStatusBadgeClassName(status)} ${className}`.trim()}
    >
      {status}
    </span>
  );
}
