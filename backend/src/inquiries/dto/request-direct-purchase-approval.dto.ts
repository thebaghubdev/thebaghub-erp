import { Transform, Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class RequestDirectPurchaseApprovalDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  offerPrice: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  consignmentOfferPrice: number;

  @Transform(({ value }) => (value == null ? '' : String(value)))
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  notes?: string;
}
