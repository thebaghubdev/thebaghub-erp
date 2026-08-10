import { Type } from 'class-transformer';
import { IsNumber, IsString, Min, MinLength } from 'class-validator';

export class StaffPulloutInquiryDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pulloutFee: number;

  @IsString()
  @MinLength(1)
  pulloutReason: string;
}
