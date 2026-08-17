import { IsIn } from 'class-validator';
import { DIRECT_PURCHASE_PAYMENT_STATUS_PAYMENT_SENT } from '../direct-purchase-payment.constants';

export class UpdateDirectPurchasePaymentStatusDto {
  @IsIn([DIRECT_PURCHASE_PAYMENT_STATUS_PAYMENT_SENT])
  status: typeof DIRECT_PURCHASE_PAYMENT_STATUS_PAYMENT_SENT;
}
