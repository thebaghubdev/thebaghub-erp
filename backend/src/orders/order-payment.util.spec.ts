import {
  computeFullPaymentCredit,
  computeOrderPaymentRemainingBalance,
  reservationFeeCredit,
  shouldShowPriorFullPayments,
  sumConfirmedOrderPayments,
} from './order-payment.util';
import { OrderPayment } from './entities/order-payment.entity';
import { Order } from './entities/order.entity';
import {
  ORDER_PAYMENT_STATUS_CONFIRMED,
  ORDER_PAYMENT_STATUS_PENDING,
  ORDER_STATUS_FOR_PAYMENT,
  ORDER_STATUS_RESERVATION,
  PAYMENT_TYPE_FULL,
  PAYMENT_TYPE_LAYAWAY,
} from './order-status.constants';

function baseOrder(overrides: Partial<Order> = {}): Order {
  return {
    paymentType: PAYMENT_TYPE_FULL,
    status: ORDER_STATUS_FOR_PAYMENT,
    fullPaymentPrice: '10000.00',
    orderTotalPrice: null,
    reservationPaymentProofUploadedAt: null,
    inventoryItem: { tbhSellingPrice: '50000.00' } as Order['inventoryItem'],
    ...overrides,
  } as Order;
}

describe('order-payment.util', () => {
  it('computes remaining balance for full payment orders', () => {
    const payments = [
      {
        amountPaid: '3000.00',
        status: ORDER_PAYMENT_STATUS_CONFIRMED,
      },
      {
        amountPaid: '2000.00',
        status: ORDER_PAYMENT_STATUS_PENDING,
      },
    ] as OrderPayment[];

    expect(
      computeOrderPaymentRemainingBalance(
        baseOrder(),
        payments,
        10_000,
      ),
    ).toBe('7000.00');
  });

  it('applies reservation fee credit when reservation proof exists', () => {
    const order = baseOrder({
      status: ORDER_STATUS_RESERVATION,
      fullPaymentPrice: '5000.00',
      reservationPaymentProofUploadedAt: new Date('2026-01-01'),
    });

    expect(reservationFeeCredit(order)).toBe(5000);
    expect(
      computeOrderPaymentRemainingBalance(
        order,
        [],
        50_000,
      ),
    ).toBe('45000.00');
  });

  it('uses order total price override when set', () => {
    const order = baseOrder({
      orderTotalPrice: '8500.00',
      fullPaymentPrice: '10000.00',
    } as Partial<Order>);

    expect(
      computeOrderPaymentRemainingBalance(
        order as Order,
        [],
        10_000,
      ),
    ).toBe('8500.00');
  });

  it('sums only confirmed payments', () => {
    expect(
      sumConfirmedOrderPayments([
        { amountPaid: '100.00', status: ORDER_PAYMENT_STATUS_CONFIRMED },
        { amountPaid: '50.00', status: ORDER_PAYMENT_STATUS_PENDING },
      ] as OrderPayment[]),
    ).toBe(100);
  });

  it('computes full payment credit including reservation fee', () => {
    const order = baseOrder({
      status: ORDER_STATUS_RESERVATION,
      reservationPaymentProofUploadedAt: new Date('2026-01-01'),
    });
    const payments = [
      { amountPaid: '2500.00', status: ORDER_PAYMENT_STATUS_CONFIRMED },
    ] as OrderPayment[];

    expect(computeFullPaymentCredit(order, payments)).toBe(7500);
  });

  it('shows prior full payments only for converted layaway orders', () => {
    expect(
      shouldShowPriorFullPayments(
        {
          paymentType: PAYMENT_TYPE_LAYAWAY,
          convertedToLayawayAt: new Date('2026-01-01'),
        } as Order,
        2,
      ),
    ).toBe(true);
    expect(
      shouldShowPriorFullPayments(
        { paymentType: PAYMENT_TYPE_LAYAWAY, convertedToLayawayAt: null } as Order,
        2,
      ),
    ).toBe(false);
    expect(
      shouldShowPriorFullPayments(
        { paymentType: PAYMENT_TYPE_FULL, convertedToLayawayAt: null } as Order,
        2,
      ),
    ).toBe(false);
  });
});
