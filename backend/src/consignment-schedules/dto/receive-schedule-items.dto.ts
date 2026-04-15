import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ReceiveItemFormDto } from './receive-item-form.dto';

export class ReceiveScheduleItemRowDto {
  @IsUUID()
  inquiryId: string;

  @ValidateNested()
  @Type(() => ReceiveItemFormDto)
  form: ReceiveItemFormDto;
}

export class ReceiveScheduleItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveScheduleItemRowDto)
  items: ReceiveScheduleItemRowDto[];
}
