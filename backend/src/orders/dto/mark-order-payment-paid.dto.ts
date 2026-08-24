import { IsDateString, IsIn, IsNumberString, Matches } from 'class-validator';
import { ALLOWED_ORDER_PAYMENT_MODE_VALUES } from '../order-payment.util';

export class MarkOrderPaymentPaidDto {
  @IsNumberString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'amountPaid must be a valid decimal with up to 2 places',
  })
  amountPaid: string;

  @IsDateString()
  paymentDate: string;

  @IsIn([...ALLOWED_ORDER_PAYMENT_MODE_VALUES])
  modeOfPayment: string;
}
