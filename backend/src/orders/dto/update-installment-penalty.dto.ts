import { IsOptional, Matches } from 'class-validator';

export class UpdateInstallmentPenaltyDto {
  @IsOptional()
  @Matches(/^(\d+(\.\d{1,2})?)?$/, {
    message: 'penalty must be a valid decimal with up to 2 places',
  })
  penalty?: string;
}
