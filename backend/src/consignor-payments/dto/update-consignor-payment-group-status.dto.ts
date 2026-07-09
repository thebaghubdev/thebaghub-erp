import { IsIn } from 'class-validator';
import { CONSIGNOR_PAYMENT_GROUP_STATUS_PAYMENT_SENT } from '../consignor-payment.constants';

export class UpdateConsignorPaymentGroupStatusDto {
  @IsIn([CONSIGNOR_PAYMENT_GROUP_STATUS_PAYMENT_SENT])
  status: typeof CONSIGNOR_PAYMENT_GROUP_STATUS_PAYMENT_SENT;
}
