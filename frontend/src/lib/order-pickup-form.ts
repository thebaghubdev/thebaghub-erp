export type OrderPickupFormValues = {
  pickupOption: string;
  pickupBranch: string;
  courierService: string;
};

export const EMPTY_ORDER_PICKUP_FORM: OrderPickupFormValues = {
  pickupOption: "",
  pickupBranch: "",
  courierService: "",
};

export function isOrderPickupFormValid(values: OrderPickupFormValues): boolean {
  if (!values.pickupOption) return false;
  if (
    values.pickupOption === "store_pickup" ||
    values.pickupOption === "in_store_purchase"
  ) {
    return Boolean(values.pickupBranch);
  }
  if (values.pickupOption === "courier_delivery") {
    return Boolean(values.courierService);
  }
  return false;
}

export function orderPickupPayloadFields(
  values: OrderPickupFormValues,
): Record<string, string> {
  const payload: Record<string, string> = {
    pickupOption: values.pickupOption,
  };
  if (
    values.pickupOption === "store_pickup" ||
    values.pickupOption === "in_store_purchase"
  ) {
    payload.pickupBranch = values.pickupBranch;
  }
  if (values.pickupOption === "courier_delivery") {
    payload.courierService = values.courierService;
  }
  return payload;
}
