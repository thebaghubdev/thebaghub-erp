import { IsNumberString, Matches } from 'class-validator';

export class UpdateOrderTotalPriceDto {
  @IsNumberString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'orderTotalPrice must be a valid decimal with up to 2 places',
  })
  orderTotalPrice: string;
}
