import { BadRequestException } from '@nestjs/common';
import {
  COURIER_SERVICE_OPTIONS,
  PICKUP_BRANCH_OPTIONS,
  PICKUP_OPTION_COURIER,
  PICKUP_OPTION_IN_STORE,
  PICKUP_OPTION_STORE,
  PICKUP_OPTIONS,
} from './order-pickup.constants';

export type ResolvedOrderPickupFields = {
  pickupOption: string;
  pickupBranch: string | null;
  courierService: string | null;
};

export function resolveOrderPickupFields(input: {
  pickupOptionRaw?: string;
  pickupBranchRaw?: string;
  courierServiceRaw?: string;
}): ResolvedOrderPickupFields {
  const pickupOption = input.pickupOptionRaw?.trim() ?? '';
  if (
    !PICKUP_OPTIONS.includes(
      pickupOption as (typeof PICKUP_OPTIONS)[number],
    )
  ) {
    throw new BadRequestException('Pick-up option is required');
  }

  let pickupBranch: string | null = null;
  let courierService: string | null = null;

  if (
    pickupOption === PICKUP_OPTION_STORE ||
    pickupOption === PICKUP_OPTION_IN_STORE
  ) {
    pickupBranch = input.pickupBranchRaw?.trim() ?? '';
    if (
      !PICKUP_BRANCH_OPTIONS.includes(
        pickupBranch as (typeof PICKUP_BRANCH_OPTIONS)[number],
      )
    ) {
      throw new BadRequestException('Pick-up branch must be Makati or Pasig');
    }
  } else if (pickupOption === PICKUP_OPTION_COURIER) {
    courierService = input.courierServiceRaw?.trim() ?? '';
    if (
      !COURIER_SERVICE_OPTIONS.includes(
        courierService as (typeof COURIER_SERVICE_OPTIONS)[number],
      )
    ) {
      throw new BadRequestException('Courier service is required');
    }
  }

  return { pickupOption, pickupBranch, courierService };
}
