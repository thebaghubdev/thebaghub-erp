import { Transform } from 'class-transformer';
import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { DELIVERY_TIME_SLOT_VALUES } from '../../consignment-schedules/delivery-time-slot.constants';

export class RescheduleClientDeliveryScheduleDto {
  /** Local calendar date `yyyy-MM-dd` (stored as noon UTC on the schedule). */
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  deliveryDate: string;

  @IsIn(DELIVERY_TIME_SLOT_VALUES)
  deliveryTimeSlot: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1, { message: 'Reschedule reason is required' })
  @MaxLength(8000)
  rescheduleReason: string;
}
