import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class DeclineInquiryDto {
  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @MinLength(1, { message: 'Decline reason is required' })
  @MaxLength(10_000)
  reason: string;
}
