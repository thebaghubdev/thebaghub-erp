import { ArrayNotEmpty, IsArray, IsDateString, IsUUID } from 'class-validator';

export class CreateItemPhotoshootsDto {
  @IsDateString()
  photoshootDate: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  inventoryItemIds: string[];
}
