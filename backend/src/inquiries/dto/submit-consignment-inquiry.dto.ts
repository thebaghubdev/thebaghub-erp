import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const MAX_ITEMS = 10;

export class ConsignItemFormDto {
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
  @MaxLength(500)
  sourceOfPurchase: string;

  @IsString()
  @MaxLength(4000)
  specialInstructions: string;

  @IsString()
  @MaxLength(64)
  consignmentSellingPrice: string;

  @IsString()
  @MaxLength(64)
  directPurchaseSellingPrice: string;

  @IsBoolean()
  consentDirectPurchase: boolean;

  @IsBoolean()
  consentPriceNomination: boolean;
}

export class SubmitConsignmentInquiryItemDto {
  @IsString()
  @IsNotEmpty()
  clientItemId: string;

  @ValidateNested()
  @Type(() => ConsignItemFormDto)
  form: ConsignItemFormDto;

  @IsInt()
  @Min(1)
  imageCount: number;
}

export class SubmitConsignmentInquiryDto {
  @ValidateNested({ each: true })
  @Type(() => SubmitConsignmentInquiryItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ITEMS)
  items: SubmitConsignmentInquiryItemDto[];
}
