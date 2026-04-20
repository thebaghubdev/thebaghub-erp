import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ReturnToCoordinatorDto {
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  returnReasons?: string;

  /** Decimal string e.g. `1234.56`; optional. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  priceRangeMin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  priceRangeMax?: string;

  /** Image data URLs (`data:image/...;base64,...`). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  returnPhotos?: string[];
}
