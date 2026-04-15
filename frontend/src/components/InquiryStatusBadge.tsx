import { formatInquiryStatus } from "../lib/format-inquiry-status";
import { inquiryStatusBadgeClassName } from "../lib/inquiry-status-badge";

const baseClass = "font-medium";

type Props = {
  status: string;
  className?: string;
};

export function InquiryStatusBadge({ status, className = "" }: Props) {
  return (
    <span
      className={`${baseClass} ${inquiryStatusBadgeClassName(status)} ${className}`.trim()}
    >
      {formatInquiryStatus(status)}
    </span>
  );
}
