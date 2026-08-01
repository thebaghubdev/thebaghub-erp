import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { DELIVERY_TIME_SLOT_VALUES, type DeliveryTimeSlot } from '../delivery-time-slot.constants';

export class CreateConsignmentScheduleDto {
  @IsIn(['delivery', 'pullout'])
  type: 'delivery' | 'pullout';

  @IsString()
  @MaxLength(64)
  modeOfTransfer: string;

  @IsString()
  @IsIn(['pasig', 'makati'])
  branch: string;

  /** Local calendar date `yyyy-MM-dd` (stored as start-of-day UTC on the schedule). */
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  deliveryDate: string;

  @ValidateIf((o: CreateConsignmentScheduleDto) => o.type === 'delivery')
  @IsIn(DELIVERY_TIME_SLOT_VALUES)
  deliveryTimeSlot?: DeliveryTimeSlot;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  inquiryIds: string[];
}
