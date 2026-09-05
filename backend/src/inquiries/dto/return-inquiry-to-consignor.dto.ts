import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReturnInquiryToConsignorDto {
  @Transform(({ value }: { value: unknown }): string => {
    if (typeof value === 'string') return value.trim();
    return '';
  })
  @IsString()
  @IsNotEmpty({ message: 'Reason is required' })
  @MaxLength(20000)
  reason: string;

  /** Required when the authentication return case includes renegotiation. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  newOfferPrice?: string;

  /** Required when the authentication return case includes 3rd party authentication. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  authenticationFee?: string;
}
