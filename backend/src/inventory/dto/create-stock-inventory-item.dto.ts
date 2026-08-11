import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CreateStockInventoryItemFormDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  itemModel: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  brand: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  category: string;

  @IsString()
  @MaxLength(200)
  serialNumber: string;

  @IsString()
  @MaxLength(200)
  color: string;

  @IsString()
  @MaxLength(200)
  material: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  condition: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  inclusions: string;

  @IsString()
  @MaxLength(32)
  datePurchased: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  sourceOfPurchase: string;
}

export class CreateStockInventoryItemDto {
  @ValidateNested()
  @Type(() => CreateStockInventoryItemFormDto)
  form: CreateStockInventoryItemFormDto;

  @IsString()
  @IsIn(['Pasig', 'Makati'])
  currentBranch: string;

  /** Calendar date `YYYY-MM-DD` (staff-editable received date). */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateReceived must be YYYY-MM-DD',
  })
  dateReceived: string;
}
