import { wholePesosFromMoney } from '../clients/client-activity-totals.util';
import { Order } from './entities/order.entity';
import { isInstallmentPaymentType } from './order-payment-type.util';

/** Amount the buyer purchased the item for, in whole PHP pesos. */
export function purchaseAmountPesosFromOrder(
  order: Pick<
    Order,
    'paymentType' | 'orderTotalPrice' | 'fullPaymentPrice' | 'layawayPrice'
  >,
): number {
  if (isInstallmentPaymentType(order.paymentType)) {
    return wholePesosFromMoney(order.layawayPrice);
  }
  if (
    order.orderTotalPrice != null &&
    String(order.orderTotalPrice).trim() !== ''
  ) {
    return wholePesosFromMoney(order.orderTotalPrice);
  }
  return wholePesosFromMoney(order.fullPaymentPrice);
}

/** Consignor price (inquiry offer price) in whole PHP pesos. */
export function consignorPricePesosFromOffer(
  offerPrice: string | number | null | undefined,
): number {
  return wholePesosFromMoney(offerPrice);
}
