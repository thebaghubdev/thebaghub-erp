import { IsIn } from 'class-validator';
import {
  CONSIGNOR_PAYMENT_GROUP_STATUS_PAYMENT_SENT,
  CONSIGNOR_PAYMENT_GROUP_STATUS_UNABLE_TO_SEND,
} from '../consignor-payment.constants';

export class UpdateConsignorPaymentGroupStatusDto {
  @IsIn([
    CONSIGNOR_PAYMENT_GROUP_STATUS_PAYMENT_SENT,
    CONSIGNOR_PAYMENT_GROUP_STATUS_UNABLE_TO_SEND,
  ])
  status:
    | typeof CONSIGNOR_PAYMENT_GROUP_STATUS_PAYMENT_SENT
    | typeof CONSIGNOR_PAYMENT_GROUP_STATUS_UNABLE_TO_SEND;
}
