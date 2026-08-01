import { IsDateString, IsIn, IsNumberString, Matches } from 'class-validator';
import { ORDER_PAYMENT_MODE_OPTIONS } from '../order-payment.util';

export class MarkOrderPaymentPaidDto {
  @IsNumberString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'amountPaid must be a valid decimal with up to 2 places',
  })
  amountPaid: string;

  @IsDateString()
  paymentDate: string;

  @IsIn([...ORDER_PAYMENT_MODE_OPTIONS])
  modeOfPayment: string;
}
