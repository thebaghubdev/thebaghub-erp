import { IsIn, ValidateIf } from 'class-validator';
import {
  COURIER_SERVICE_OPTIONS,
  PICKUP_BRANCH_OPTIONS,
  PICKUP_OPTION_COURIER,
  PICKUP_OPTION_IN_STORE,
  PICKUP_OPTION_STORE,
  PICKUP_OPTIONS,
} from '../order-pickup.constants';

export class OrderPickupFieldsDto {
  @IsIn([...PICKUP_OPTIONS])
  pickupOption: string;

  @ValidateIf(
    (o: OrderPickupFieldsDto) =>
      o.pickupOption === PICKUP_OPTION_STORE ||
      o.pickupOption === PICKUP_OPTION_IN_STORE,
  )
  @IsIn([...PICKUP_BRANCH_OPTIONS])
  pickupBranch: string;

  @ValidateIf((o: OrderPickupFieldsDto) => o.pickupOption === PICKUP_OPTION_COURIER)
  @IsIn([...COURIER_SERVICE_OPTIONS])
  courierService: string;
}
