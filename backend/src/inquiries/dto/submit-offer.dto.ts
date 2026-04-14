import { Type } from 'class-transformer';
import { IsIn, IsNumber, Min } from 'class-validator';

export class SubmitOfferDto {
  @IsIn(['consignment', 'direct_purchase'])
  transactionType: 'consignment' | 'direct_purchase';

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  offerPrice: number;
}
