import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RescheduleConsignmentScheduleDto {
  /** Local calendar date `yyyy-MM-dd` (stored as noon UTC on the schedule). */
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  deliveryDate: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1, { message: 'Reschedule reason is required' })
  @MaxLength(8000)
  rescheduleReason: string;
}