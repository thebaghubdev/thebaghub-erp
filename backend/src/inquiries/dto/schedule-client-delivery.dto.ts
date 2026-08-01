import { IsIn, IsString, Matches, MaxLength } from 'class-validator';
import { DELIVERY_TIME_SLOT_VALUES } from '../../consignment-schedules/delivery-time-slot.constants';

export const CLIENT_DELIVERY_MODE_VALUES = [
  'courier',
  'consignor_dropoff',
  'pickup_service',
] as const;

export type ClientDeliveryMode = (typeof CLIENT_DELIVERY_MODE_VALUES)[number];

export class ScheduleClientDeliveryDto {
  /** Local calendar date `yyyy-MM-dd`. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  deliveryDate: string;

  @IsIn(DELIVERY_TIME_SLOT_VALUES)
  deliveryTimeSlot: string;

  @IsString()
  @MaxLength(64)
  @IsIn(CLIENT_DELIVERY_MODE_VALUES)
  modeOfTransfer: ClientDeliveryMode;

  @IsIn(['pasig', 'makati'])
  branch: 'pasig' | 'makati';
}
