import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { ScheduleClientDeliveryDto } from './schedule-client-delivery.dto';

export class CreateClientDeliveryScheduleDto extends ScheduleClientDeliveryDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  inquiryIds: string[];
}
