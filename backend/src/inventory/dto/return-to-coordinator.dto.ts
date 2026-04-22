import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export class ReturnToCoordinatorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  returnReasons: string;

  /** Decimal string e.g. `1234.56` (required with `priceRangeMax`). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  priceRangeMin: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  priceRangeMax: string;

  /** Image data URLs (`data:image/...;base64,...`); at least one required. */
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  returnPhotos: string[];
}
