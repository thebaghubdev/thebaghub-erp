import { IsInt, IsNumberString, Matches, Max, Min } from 'class-validator';
import {
  MAX_LAYAWAY_MONTHS,
  MIN_LAYAWAY_MONTHS,
} from '../layaway-pricing.util';

export class UpdateLayawayTermsDto {
  @IsInt()
  @Min(MIN_LAYAWAY_MONTHS)
  @Max(MAX_LAYAWAY_MONTHS)
  layawayMonths: number;

  @IsNumberString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'layawayPrice must be a valid decimal with up to 2 places',
  })
  layawayPrice: string;

  @IsInt()
  @Min(1)
  consignorPaymentRelease: number;
}
