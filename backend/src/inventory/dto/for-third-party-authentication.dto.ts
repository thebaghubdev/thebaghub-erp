import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

function toBoolean(value: unknown): boolean {
  if (value === true || value === 'true' || value === 1 || value === '1') {
    return true;
  }
  return false;
}

export class ForThirdPartyAuthenticationDto {
  @Transform(({ value }: { value: unknown }): string => {
    if (typeof value === 'string') return value.trim();
    return '';
  })
  @IsString()
  @IsNotEmpty({ message: 'Reasons for re-authentication are required' })
  @MaxLength(20000)
  reauthenticationReasons: string;

  /** Image data URLs (`data:image/...;base64,...`); at least one required. */
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  issuePhotos: string[];

  @Transform(({ value }: { value: unknown }): boolean => toBoolean(value))
  @IsBoolean()
  @IsOptional()
  renegotiate?: boolean;

  @ValidateIf((o: ForThirdPartyAuthenticationDto) => o.renegotiate === true)
  @IsString()
  @IsNotEmpty({
    message: 'Reasons for renegotiation are required when Renegotiate is on',
  })
  @MaxLength(20000)
  returnReasons?: string;

  @ValidateIf((o: ForThirdPartyAuthenticationDto) => o.renegotiate === true)
  @IsString()
  @IsNotEmpty({
    message: 'Suggested price range is required when Renegotiate is on',
  })
  @MaxLength(32)
  priceRangeMin?: string;

  @ValidateIf((o: ForThirdPartyAuthenticationDto) => o.renegotiate === true)
  @IsString()
  @IsNotEmpty({
    message: 'Suggested price range is required when Renegotiate is on',
  })
  @MaxLength(32)
  priceRangeMax?: string;
}
