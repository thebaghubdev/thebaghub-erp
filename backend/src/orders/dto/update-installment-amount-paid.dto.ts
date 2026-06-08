import { IsNumberString, Matches } from 'class-validator';

export class UpdateInstallmentAmountPaidDto {
  @IsNumberString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'amountPaid must be a valid decimal with up to 2 places',
  })
  amountPaid: string;
}
