import { IsDateString } from 'class-validator';

export class UpdateInstallmentPaymentDateDto {
  @IsDateString()
  paymentDate: string;
}
