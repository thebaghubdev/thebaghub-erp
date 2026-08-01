import { IsDateString } from 'class-validator';

export class UpdateOrderPaymentDateDto {
  @IsDateString()
  paymentDate: string;
}
