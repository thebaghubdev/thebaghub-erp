import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class SubmitAuthenticatedReturnNewOfferDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  offerPrice: number;
}
