import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CreatePromotionItemDto {
  @IsUUID()
  inventoryItemId: string;

  @IsString()
  @IsNotEmpty()
  promoPrice: string;
}

export class CreatePromotionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  promotionName: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePromotionItemDto)
  items: CreatePromotionItemDto[];
}

export class UpdatePromotionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  promotionName: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePromotionItemDto)
  items: CreatePromotionItemDto[];
}
