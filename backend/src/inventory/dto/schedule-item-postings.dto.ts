import { ArrayNotEmpty, IsArray, IsDateString, IsUUID } from 'class-validator';

export class ScheduleItemPostingsDto {
  @IsDateString()
  postingDate: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  inventoryItemIds: string[];
}
