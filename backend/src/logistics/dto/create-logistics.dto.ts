import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateLogisticsDto {
  @IsDateString()
  transferDate: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  sendingBranch: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  receivingBranch: string;

  @IsString()
  @MinLength(1)
  reasonForTransfer: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  modeOfTransfer: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  trackingName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  trackingNumber: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  inventoryItemIds: string[];
}
