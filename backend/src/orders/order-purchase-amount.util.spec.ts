import {
  consignorPricePesosFromOffer,
  purchaseAmountPesosFromOrder,
} from './order-purchase-amount.util';
import {
  PAYMENT_TYPE_CREDIT_LINE,
  PAYMENT_TYPE_FULL,
  PAYMENT_TYPE_LAYAWAY,
} from './order-status.constants';

describe('purchaseAmountPesosFromOrder', () => {
  it('uses order total override for full payment', () => {
    expect(
      purchaseAmountPesosFromOrder({
        paymentType: PAYMENT_TYPE_FULL,
        orderTotalPrice: '8500.00',
        fullPaymentPrice: '10000.00',
        layawayPrice: null,
      }),
    ).toBe(8500);
  });

  it('falls back to full payment price when no override is set', () => {
    expect(
      purchaseAmountPesosFromOrder({
        paymentType: PAYMENT_TYPE_FULL,
        orderTotalPrice: null,
        fullPaymentPrice: '12500.40',
        layawayPrice: '99999.00',
      }),
    ).toBe(12500);
  });

  it('uses layaway price for installment orders', () => {
    expect(
      purchaseAmountPesosFromOrder({
        paymentType: PAYMENT_TYPE_LAYAWAY,
        orderTotalPrice: '8000.00',
        fullPaymentPrice: '10000.00',
        layawayPrice: '11200.00',
      }),
    ).toBe(11200);
    expect(
      purchaseAmountPesosFromOrder({
        paymentType: PAYMENT_TYPE_CREDIT_LINE,
        orderTotalPrice: null,
        fullPaymentPrice: '10000.00',
        layawayPrice: '10800.49',
      }),
    ).toBe(10800);
  });
});

describe('consignorPricePesosFromOffer', () => {
  it('converts offer price to whole pesos', () => {
    expect(consignorPricePesosFromOffer('7500.00')).toBe(7500);
    expect(consignorPricePesosFromOffer(null)).toBe(0);
  });
});
