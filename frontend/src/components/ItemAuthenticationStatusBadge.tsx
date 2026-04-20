import { itemAuthenticationStatusBadgeClassName } from "../lib/item-authentication-status-badge";

const baseClass = "font-medium";

type Props = {
  status: string;
  className?: string;
};

export function ItemAuthenticationStatusBadge({ status, className = "" }: Props) {
  return (
    <span
      className={`${baseClass} ${itemAuthenticationStatusBadgeClassName(status)} ${className}`.trim()}
    >
      {status}
    </span>
  );
}
