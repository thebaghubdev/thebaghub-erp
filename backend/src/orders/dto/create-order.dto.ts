import {
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  MAX_LAYAWAY_MONTHS,
  MIN_LAYAWAY_MONTHS,
} from '../layaway-pricing.util';
import {
  PAYMENT_TYPE_CREDIT_LINE,
  PAYMENT_TYPE_FULL,
  PAYMENT_TYPE_LAYAWAY,
} from '../order-status.constants';

export class CreateOrderDto {
  @IsUUID()
  inventoryItemId: string;

  @IsIn([PAYMENT_TYPE_FULL, PAYMENT_TYPE_LAYAWAY, PAYMENT_TYPE_CREDIT_LINE])
  paymentType:
    | typeof PAYMENT_TYPE_FULL
    | typeof PAYMENT_TYPE_LAYAWAY
    | typeof PAYMENT_TYPE_CREDIT_LINE;

  @ValidateIf(
    (o: CreateOrderDto) =>
      o.paymentType === PAYMENT_TYPE_LAYAWAY ||
      o.paymentType === PAYMENT_TYPE_CREDIT_LINE,
  )
  @IsInt()
  @Min(MIN_LAYAWAY_MONTHS)
  @Max(MAX_LAYAWAY_MONTHS)
  @IsOptional()
  layawayMonths?: number;
}
