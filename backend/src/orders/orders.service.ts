import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { DataSource, Repository } from 'typeorm';
import { JwtUser } from '../auth/jwt-user';
import { Client } from '../clients/entities/client.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import type { MulterFile } from '../inquiries/multer-file.type';
import { S3StorageService } from '../inquiries/s3-storage.service';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateReservationOrderDto } from './dto/create-reservation-order.dto';
import { DeclineLayawayOrderDto } from './dto/decline-layaway-order.dto';
import { UpdateInstallmentAmountPaidDto } from './dto/update-installment-amount-paid.dto';
import { UpdateLayawayTermsDto } from './dto/update-layaway-terms.dto';
import { OrderInstallment } from './entities/order-installment.entity';
import { Order } from './entities/order.entity';
import { Waitlist } from './entities/waitlist.entity';
import { calculateLayawayPricing } from './layaway-pricing.util';
import {
  buildScheduledAmounts,
  computeInstallmentViews,
  computeRemainingBalance,
  formatMoney,
  parseMoney,
  shouldIncludeInstallmentSchedule,
  type OrderInstallmentView,
} from './order-installment.util';
import {
  FULL_PAYMENT_HOLDING_HOURS,
  INVENTORY_STATUS_AVAILABLE_FOR_PURCHASE,
  INVENTORY_STATUS_ON_HOLD,
  LAYAWAY_HOLDING_HOURS,
  ORDER_STATUS_CANCELLED,
  ORDER_STATUS_DECLINED,
  ORDER_STATUS_EXPIRED,
  ORDER_STATUS_FOR_LAYAWAY_APPROVAL,
  ORDER_STATUS_FOR_PAYMENT,
  ORDER_STATUS_PAID,
  ORDER_STATUS_RESERVATION,
  ORDER_NUMBER_OFFSET,
  PAYMENT_TYPE_FULL,
  PAYMENT_TYPE_LAYAWAY,
  RESERVATION_HOLDING_HOURS,
} from './order-status.constants';

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

const ALLOWED_PROOF_MIMES = new Set([
  ...ALLOWED_IMAGE_MIMES,
  'application/pdf',
]);

const RESERVATION_FEE = 5_000;

export type { OrderInstallmentView };

function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m === 'image/jpeg') return 'jpg';
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/gif') return 'gif';
  if (m === 'image/heic' || m === 'image/heif') return 'heic';
  return 'bin';
}

function extFromProofMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m === 'application/pdf') return 'pdf';
  return extFromMime(mime);
}

function parseItemPrice(raw: string | null | undefined): number | null {
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number.parseFloat(String(raw));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatDecimal(value: number): string {
  return value.toFixed(2);
}

function addHours(ref: Date, hours: number): Date {
  return new Date(ref.getTime() + hours * 60 * 60 * 1000);
}

export type ClientOrderSummary = {
  id: string;
  orderNumber: number;
  status: string;
  inventoryItemId: string;
  paymentType: string;
  layawayMonths: number | null;
  layawayPrice: string | null;
  layawayMonthlyPayment: string | null;
  fullPaymentPrice: string | null;
  holdingPeriod: string | null;
  createdAt: string;
};

export type ClientOrderListRow = {
  id: string;
  orderNumber: number;
  status: string;
  itemSku: string;
  itemLabel: string;
  paymentType: string;
  amount: string | null;
  createdAt: string;
};

export type ClientWaitlistRow = {
  id: string;
  inventoryItemId: string;
  itemSku: string;
  itemLabel: string;
  productName: string;
  status: string;
  price: string | null;
  createdAt: string;
};

export type ClientOrderDetail = {
  id: string;
  orderNumber: number;
  status: string;
  paymentType: string;
  layawayMonths: number | null;
  layawayPrice: string | null;
  layawayMonthlyPayment: string | null;
  fullPaymentPrice: string | null;
  fullPaymentTotalPrice: string | null;
  remainingBalancePrice: string | null;
  reservationPaymentProofUrl: string | null;
  fullPaymentProofUrl: string | null;
  holdingPeriod: string | null;
  declineReason: string | null;
  signatureUrl: string | null;
  createdAt: string;
  updatedAt: string;
  inventoryItem: {
    id: string;
    sku: string;
    itemLabel: string;
  };
  installments: OrderInstallmentView[];
};

export type StaffOrderRow = {
  id: string;
  orderNumber: number;
  status: string;
  customerName: string;
  itemSku: string;
  itemLabel: string;
  paymentType: string;
  amount: string | null;
  layawayMonths: number | null;
  holdingPeriod: string | null;
  createdAt: string;
};

export type StaffOrderDetail = {
  id: string;
  orderNumber: number;
  status: string;
  paymentType: string;
  layawayMonths: number | null;
  layawayPrice: string | null;
  layawayMonthlyPayment: string | null;
  fullPaymentPrice: string | null;
  fullPaymentTotalPrice: string | null;
  remainingBalancePrice: string | null;
  reservationPaymentProofUrl: string | null;
  fullPaymentProofUrl: string | null;
  holdingPeriod: string | null;
  layawayPaymentStartDate: string | null;
  declineReason: string | null;
  signatureUrl: string | null;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    contactNumber: string;
    completeAddress: string | null;
  };
  inventoryItem: {
    id: string;
    sku: string;
    itemLabel: string;
    status: string;
  };
  installments: OrderInstallmentView[];
};

function snapshotFormString(
  form: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = form?.[key];
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function itemLabelFromSnapshot(item: InventoryItem): string {
  const form = item.itemSnapshot?.form as Record<string, unknown> | undefined;
  const brand = snapshotFormString(form, 'brand');
  const model = snapshotFormString(form, 'itemModel');
  if (brand && model) return `${brand} — ${model}`;
  return brand ?? model ?? 'Item';
}

function customerName(client: Client): string {
  return `${client.firstName} ${client.lastName}`.trim() || client.email;
}

function formatOrderDate(
  value: Date | string | null | undefined,
): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, 10);
}

function todayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function nextOrderNumber(currentMax: number | null): number {
  if (currentMax == null || currentMax < ORDER_NUMBER_OFFSET) {
    return ORDER_NUMBER_OFFSET + 1;
  }
  return currentMax + 1;
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
    @InjectRepository(OrderInstallment)
    private readonly installmentsRepo: Repository<OrderInstallment>,
    @InjectRepository(Waitlist)
    private readonly waitlistsRepo: Repository<Waitlist>,
    @InjectRepository(Client)
    private readonly clientsRepo: Repository<Client>,
    @InjectRepository(InventoryItem)
    private readonly inventoryRepo: Repository<InventoryItem>,
    private readonly dataSource: DataSource,
    private readonly s3: S3StorageService,
  ) {}

  private async getInstallmentViewsForOrder(
    order: Order,
  ): Promise<OrderInstallmentView[]> {
    if (
      order.paymentType !== PAYMENT_TYPE_LAYAWAY ||
      (order.status !== ORDER_STATUS_FOR_PAYMENT &&
        order.status !== ORDER_STATUS_PAID) ||
      order.layawayMonths == null ||
      order.layawayMonths <= 0
    ) {
      return [];
    }
    await this.ensureInstallments(order);
    const rows = await this.installmentsRepo.find({
      where: { orderId: order.id },
      order: { installmentNumber: 'ASC' },
    });
    return computeInstallmentViews(
      rows,
      formatOrderDate(order.layawayPaymentStartDate),
      (key) => this.s3.getPublicUrl(key),
    );
  }

  private async ensureInstallments(
    order: Order,
    userId?: string,
  ): Promise<void> {
    if (
      !order.layawayMonths ||
      !order.layawayPrice ||
      !order.layawayMonthlyPayment
    ) {
      return;
    }

    const existingCount = await this.installmentsRepo.count({
      where: { orderId: order.id },
    });
    if (existingCount >= order.layawayMonths) {
      return;
    }

    const scheduledAmounts = buildScheduledAmounts(
      order.layawayPrice,
      order.layawayMonthlyPayment,
      order.layawayMonths,
    );

    const rows = scheduledAmounts.map((scheduledAmount, index) =>
      this.installmentsRepo.create({
        orderId: order.id,
        installmentNumber: index + 1,
        scheduledAmount,
        amountPaid: null,
        proofKey: null,
        proofUploadedAt: null,
        proofUploadedByUserId: null,
        createdById: userId ?? order.updatedById,
        updatedById: userId ?? order.updatedById,
      }),
    );
    await this.installmentsRepo.save(rows);
  }

  private async createInstallmentsForOrder(
    order: Order,
    em: typeof this.ordersRepo.manager,
    userId: string,
  ): Promise<void> {
    if (
      !order.layawayMonths ||
      !order.layawayPrice ||
      !order.layawayMonthlyPayment
    ) {
      return;
    }

    const scheduledAmounts = buildScheduledAmounts(
      order.layawayPrice,
      order.layawayMonthlyPayment,
      order.layawayMonths,
    );

    for (let i = 0; i < scheduledAmounts.length; i++) {
      const row = em.create(OrderInstallment, {
        orderId: order.id,
        installmentNumber: i + 1,
        scheduledAmount: scheduledAmounts[i],
        amountPaid: null,
        proofKey: null,
        proofUploadedAt: null,
        proofUploadedByUserId: null,
        createdById: userId,
        updatedById: userId,
      });
      await em.save(row);
    }
  }

  private assertInstallmentScheduleAccessible(order: Order): void {
    if (!shouldIncludeInstallmentSchedule(order)) {
      throw new BadRequestException(
        'Installment schedule is not available for this order',
      );
    }
  }

  private assertFullPaymentProofUploadable(order: Order): void {
    if (order.paymentType !== PAYMENT_TYPE_FULL) {
      throw new BadRequestException('Order is not a full payment order');
    }
    if (
      order.status !== ORDER_STATUS_FOR_PAYMENT &&
      order.status !== ORDER_STATUS_RESERVATION
    ) {
      throw new BadRequestException(
        'Proof can only be uploaded while the order is for payment or reservation',
      );
    }
  }

  private assertReservationPaymentProofUploadable(order: Order): void {
    if (order.paymentType !== PAYMENT_TYPE_FULL) {
      throw new BadRequestException('Order is not a full payment order');
    }
    if (order.status !== ORDER_STATUS_RESERVATION) {
      throw new BadRequestException(
        'Reservation proof can only be uploaded while the order is reserved',
      );
    }
  }

  private async saveFullPaymentProof(
    order: Order,
    user: JwtUser,
    proofFile: MulterFile | undefined,
  ): Promise<void> {
    if (!proofFile?.buffer?.length) {
      throw new BadRequestException('Proof file is required');
    }

    this.assertFullPaymentProofUploadable(order);

    const mime = proofFile.mimetype?.toLowerCase() ?? '';
    if (!ALLOWED_PROOF_MIMES.has(mime)) {
      throw new BadRequestException(
        `Proof must be an image or PDF (${proofFile.mimetype || 'unknown'})`,
      );
    }

    const ext = extFromProofMime(mime);
    const proofKey = `orders/${order.id}/full-payment/proof-${randomUUID()}.${ext}`;
    await this.s3.putObject(proofKey, proofFile.buffer, mime);

    const legacyReservationProof =
      order.status === ORDER_STATUS_RESERVATION &&
      order.reservationPaymentProofKey == null
        ? order.fullPaymentProofKey
        : null;

    await this.ordersRepo.update(order.id, {
      ...(legacyReservationProof
        ? {
            reservationPaymentProofKey: legacyReservationProof,
            reservationPaymentProofUploadedAt: order.fullPaymentProofUploadedAt,
            reservationPaymentProofUploadedByUserId:
              order.fullPaymentProofUploadedByUserId,
          }
        : {}),
      fullPaymentProofKey: proofKey,
      fullPaymentProofUploadedAt: new Date(),
      fullPaymentProofUploadedByUserId: user.userId,
      updatedById: user.userId,
    });
  }

  private async saveReservationPaymentProof(
    order: Order,
    user: JwtUser,
    proofFile: MulterFile | undefined,
  ): Promise<void> {
    if (!proofFile?.buffer?.length) {
      throw new BadRequestException('Proof file is required');
    }

    this.assertReservationPaymentProofUploadable(order);

    const mime = proofFile.mimetype?.toLowerCase() ?? '';
    if (!ALLOWED_PROOF_MIMES.has(mime)) {
      throw new BadRequestException(
        `Proof must be an image or PDF (${proofFile.mimetype || 'unknown'})`,
      );
    }

    const ext = extFromProofMime(mime);
    const proofKey = `orders/${order.id}/reservation/proof-${randomUUID()}.${ext}`;
    await this.s3.putObject(proofKey, proofFile.buffer, mime);

    await this.ordersRepo.update(order.id, {
      reservationPaymentProofKey: proofKey,
      reservationPaymentProofUploadedAt: new Date(),
      reservationPaymentProofUploadedByUserId: user.userId,
      updatedById: user.userId,
    });
  }

  private reservationPaymentProofUrl(order: Order): string | null {
    const proofKey =
      order.reservationPaymentProofKey ??
      (order.status === ORDER_STATUS_RESERVATION
        ? order.fullPaymentProofKey
        : null);

    return proofKey ? this.s3.getPublicUrl(proofKey) : null;
  }

  private fullPaymentProofUrl(order: Order): string | null {
    if (
      order.status === ORDER_STATUS_RESERVATION &&
      order.reservationPaymentProofKey == null
    ) {
      return null;
    }
    return order.fullPaymentProofKey
      ? this.s3.getPublicUrl(order.fullPaymentProofKey)
      : null;
  }

  private fullPaymentTotalPrice(order: Order): string | null {
    if (order.status !== ORDER_STATUS_RESERVATION) return order.fullPaymentPrice;
    const itemPrice = parseItemPrice(order.inventoryItem?.tbhSellingPrice);
    return itemPrice == null ? null : formatMoney(itemPrice);
  }

  private remainingBalancePrice(order: Order): string | null {
    if (order.status !== ORDER_STATUS_RESERVATION) return null;
    const itemPrice = parseItemPrice(order.inventoryItem?.tbhSellingPrice);
    if (itemPrice == null) return null;
    return formatMoney(Math.max(0, itemPrice - RESERVATION_FEE));
  }

  private async findInstallmentForOrder(
    orderId: string,
    installmentNumber: number,
  ): Promise<OrderInstallment> {
    const row = await this.installmentsRepo.findOne({
      where: { orderId, installmentNumber },
    });
    if (!row) {
      throw new NotFoundException('Installment not found');
    }
    return row;
  }

  async findMineForClient(user: JwtUser): Promise<ClientOrderListRow[]> {
    const client = await this.clientsRepo.findOne({
      where: { userId: user.userId },
    });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }

    const rows = await this.ordersRepo.find({
      where: { customerId: client.id },
      relations: { inventoryItem: true },
      order: { createdAt: 'DESC' },
    });

    return rows.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      itemSku: order.inventoryItem.sku,
      itemLabel: itemLabelFromSnapshot(order.inventoryItem),
      paymentType: order.paymentType,
      amount:
        order.paymentType === PAYMENT_TYPE_LAYAWAY
          ? order.layawayPrice
          : order.fullPaymentPrice,
      createdAt: order.createdAt.toISOString(),
    }));
  }

  async findWaitlistsForClient(user: JwtUser): Promise<ClientWaitlistRow[]> {
    const client = await this.clientsRepo.findOne({
      where: { userId: user.userId },
    });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }

    const rows = await this.waitlistsRepo.find({
      where: { clientId: client.id },
      relations: { inventoryItem: { itemPosting: true } },
      order: { createdAt: 'DESC' },
    });

    return rows.map((row) => {
      const itemLabel = itemLabelFromSnapshot(row.inventoryItem);
      return {
        id: row.id,
        inventoryItemId: row.inventoryItemId,
        itemSku: row.inventoryItem.sku,
        itemLabel,
        productName:
          row.inventoryItem.itemPosting?.productName?.trim() || itemLabel,
        status: row.inventoryItem.status,
        price: row.inventoryItem.tbhSellingPrice,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  async findOneForClient(
    user: JwtUser,
    id: string,
  ): Promise<ClientOrderDetail> {
    const client = await this.clientsRepo.findOne({
      where: { userId: user.userId },
    });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }

    const order = await this.ordersRepo.findOne({
      where: { id, customerId: client.id },
      relations: { inventoryItem: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const installments = await this.getInstallmentViewsForOrder(order);

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentType: order.paymentType,
      layawayMonths: order.layawayMonths,
      layawayPrice: order.layawayPrice,
      layawayMonthlyPayment: order.layawayMonthlyPayment,
      fullPaymentPrice: order.fullPaymentPrice,
      fullPaymentTotalPrice: this.fullPaymentTotalPrice(order),
      remainingBalancePrice: this.remainingBalancePrice(order),
      reservationPaymentProofUrl: this.reservationPaymentProofUrl(order),
      fullPaymentProofUrl: this.fullPaymentProofUrl(order),
      holdingPeriod: order.holdingPeriod?.toISOString() ?? null,
      declineReason: order.declineReason,
      signatureUrl: order.signatureKey
        ? this.s3.getPublicUrl(order.signatureKey)
        : null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      inventoryItem: {
        id: order.inventoryItem.id,
        sku: order.inventoryItem.sku,
        itemLabel: itemLabelFromSnapshot(order.inventoryItem),
      },
      installments,
    };
  }

  async findAllForStaff(): Promise<StaffOrderRow[]> {
    const rows = await this.ordersRepo.find({
      relations: { customer: true, inventoryItem: true },
      order: { createdAt: 'DESC' },
    });

    return rows.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      customerName: customerName(order.customer),
      itemSku: order.inventoryItem.sku,
      itemLabel: itemLabelFromSnapshot(order.inventoryItem),
      paymentType: order.paymentType,
      amount:
        order.paymentType === PAYMENT_TYPE_LAYAWAY
          ? order.layawayPrice
          : order.fullPaymentPrice,
      layawayMonths: order.layawayMonths,
      holdingPeriod: order.holdingPeriod?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
    }));
  }

  async findOneForStaff(id: string): Promise<StaffOrderDetail> {
    const order = await this.ordersRepo.findOne({
      where: { id },
      relations: { customer: true, inventoryItem: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const installments = await this.getInstallmentViewsForOrder(order);

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentType: order.paymentType,
      layawayMonths: order.layawayMonths,
      layawayPrice: order.layawayPrice,
      layawayMonthlyPayment: order.layawayMonthlyPayment,
      fullPaymentPrice: order.fullPaymentPrice,
      fullPaymentTotalPrice: this.fullPaymentTotalPrice(order),
      remainingBalancePrice: this.remainingBalancePrice(order),
      reservationPaymentProofUrl: this.reservationPaymentProofUrl(order),
      fullPaymentProofUrl: this.fullPaymentProofUrl(order),
      holdingPeriod: order.holdingPeriod?.toISOString() ?? null,
      layawayPaymentStartDate: formatOrderDate(order.layawayPaymentStartDate),
      declineReason: order.declineReason,
      signatureUrl: order.signatureKey
        ? this.s3.getPublicUrl(order.signatureKey)
        : null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      customer: {
        id: order.customer.id,
        firstName: order.customer.firstName,
        lastName: order.customer.lastName,
        email: order.customer.email,
        contactNumber: order.customer.contactNumber,
        completeAddress: order.customer.completeAddress,
      },
      inventoryItem: {
        id: order.inventoryItem.id,
        sku: order.inventoryItem.sku,
        itemLabel: itemLabelFromSnapshot(order.inventoryItem),
        status: order.inventoryItem.status,
      },
      installments,
    };
  }

  async approveLayawayForStaff(
    user: JwtUser,
    id: string,
  ): Promise<StaffOrderDetail> {
    const order = await this.ordersRepo.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.status !== ORDER_STATUS_FOR_LAYAWAY_APPROVAL) {
      throw new BadRequestException(
        'Only orders awaiting layaway approval can be approved',
      );
    }
    if (order.paymentType !== PAYMENT_TYPE_LAYAWAY) {
      throw new BadRequestException('Order is not a layaway order');
    }

    await this.dataSource.transaction(async (em) => {
      order.status = ORDER_STATUS_FOR_PAYMENT;
      order.layawayPaymentStartDate = todayDateString();
      order.updatedById = user.userId;
      await em.save(order);
      await this.createInstallmentsForOrder(order, em, user.userId);
    });

    return this.findOneForStaff(id);
  }

  async declineLayawayForStaff(
    user: JwtUser,
    id: string,
    dto: DeclineLayawayOrderDto,
  ): Promise<StaffOrderDetail> {
    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException('Decline reason is required');
    }

    await this.dataSource.transaction(async (em) => {
      const order = await em.findOne(Order, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        throw new NotFoundException('Order not found');
      }
      if (order.status !== ORDER_STATUS_FOR_LAYAWAY_APPROVAL) {
        throw new BadRequestException(
          'Only orders awaiting layaway approval can be declined',
        );
      }
      if (order.paymentType !== PAYMENT_TYPE_LAYAWAY) {
        throw new BadRequestException('Order is not a layaway order');
      }

      const item = await em.findOne(InventoryItem, {
        where: { id: order.inventoryItemId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) {
        throw new NotFoundException('Inventory item not found');
      }

      if (item.status === INVENTORY_STATUS_ON_HOLD) {
        item.status = INVENTORY_STATUS_AVAILABLE_FOR_PURCHASE;
        item.updatedById = user.userId;
        await em.save(item);
      }

      order.status = ORDER_STATUS_DECLINED;
      order.declineReason = reason;
      order.holdingPeriod = null;
      order.updatedById = user.userId;
      await em.save(order);
    });

    return this.findOneForStaff(id);
  }

  async updateLayawayTermsForStaff(
    user: JwtUser,
    id: string,
    dto: UpdateLayawayTermsDto,
  ): Promise<StaffOrderDetail> {
    const layawayPrice = parseMoney(dto.layawayPrice);
    if (layawayPrice <= 0) {
      throw new BadRequestException('Layaway price must be greater than zero');
    }

    await this.dataSource.transaction(async (em) => {
      const order = await em.findOne(Order, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        throw new NotFoundException('Order not found');
      }
      if (order.status !== ORDER_STATUS_FOR_LAYAWAY_APPROVAL) {
        throw new BadRequestException(
          'Only orders awaiting layaway approval can have terms updated',
        );
      }
      if (order.paymentType !== PAYMENT_TYPE_LAYAWAY) {
        throw new BadRequestException('Order is not a layaway order');
      }

      order.layawayMonths = dto.layawayMonths;
      order.layawayPrice = formatMoney(layawayPrice);
      order.layawayMonthlyPayment = formatMoney(
        layawayPrice / dto.layawayMonths,
      );
      order.status = ORDER_STATUS_FOR_PAYMENT;
      order.layawayPaymentStartDate = todayDateString();
      order.updatedById = user.userId;
      await em.save(order);
      await this.createInstallmentsForOrder(order, em, user.userId);
    });

    return this.findOneForStaff(id);
  }

  async cancelOrderForStaff(
    user: JwtUser,
    id: string,
    dto: CancelOrderDto,
  ): Promise<StaffOrderDetail> {
    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException('Cancellation reason is required');
    }

    await this.dataSource.transaction(async (em) => {
      const order = await em.findOne(Order, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        throw new NotFoundException('Order not found');
      }
      if (
        order.status !== ORDER_STATUS_FOR_PAYMENT &&
        order.status !== ORDER_STATUS_PAID
      ) {
        throw new BadRequestException(
          'Only orders awaiting payment or paid orders can be cancelled',
        );
      }

      const item = await em.findOne(InventoryItem, {
        where: { id: order.inventoryItemId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) {
        throw new NotFoundException('Inventory item not found');
      }

      item.status = INVENTORY_STATUS_AVAILABLE_FOR_PURCHASE;
      item.updatedById = user.userId;
      await em.save(item);

      order.status = ORDER_STATUS_CANCELLED;
      order.declineReason = reason;
      order.holdingPeriod = null;
      order.updatedById = user.userId;
      await em.save(order);
    });

    return this.findOneForStaff(id);
  }

  async markPaidForStaff(user: JwtUser, id: string): Promise<StaffOrderDetail> {
    const order = await this.ordersRepo.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.paymentType === PAYMENT_TYPE_LAYAWAY) {
      if (order.status !== ORDER_STATUS_FOR_PAYMENT) {
        throw new BadRequestException(
          'Only layaway orders awaiting payment can be marked as paid',
        );
      }
      await this.ensureInstallments(order, user.userId);
      const rows = await this.installmentsRepo.find({
        where: { orderId: id },
      });
      const remaining = computeRemainingBalance(order.layawayPrice, rows);
      if (remaining > 0) {
        throw new BadRequestException(
          'Remaining balance must be zero before marking as paid',
        );
      }
    } else if (order.paymentType === PAYMENT_TYPE_FULL) {
      if (
        order.status !== ORDER_STATUS_FOR_PAYMENT &&
        order.status !== ORDER_STATUS_RESERVATION
      ) {
        throw new BadRequestException(
          'Only full payment orders awaiting payment or reserved can be marked as paid',
        );
      }
      if (!order.fullPaymentProofKey) {
        throw new BadRequestException(
          'Upload proof of payment before marking this order as paid',
        );
      }
    } else {
      throw new BadRequestException('Unsupported payment type');
    }

    order.status = ORDER_STATUS_PAID;
    order.updatedById = user.userId;
    await this.ordersRepo.save(order);

    return this.findOneForStaff(id);
  }

  async setInstallmentAmountPaidForStaff(
    user: JwtUser,
    orderId: string,
    installmentNumber: number,
    dto: UpdateInstallmentAmountPaidDto,
  ): Promise<StaffOrderDetail> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    this.assertInstallmentScheduleAccessible(order);
    await this.ensureInstallments(order, user.userId);

    const amount = parseMoney(dto.amountPaid);
    if (amount < 0) {
      throw new BadRequestException('Amount paid cannot be negative');
    }

    const row = await this.findInstallmentForOrder(orderId, installmentNumber);
    row.amountPaid = formatMoney(amount);
    row.updatedById = user.userId;
    await this.installmentsRepo.save(row);

    return this.findOneForStaff(orderId);
  }

  async uploadFullPaymentProofForStaff(
    user: JwtUser,
    orderId: string,
    proofFile: MulterFile | undefined,
  ): Promise<StaffOrderDetail> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.saveFullPaymentProof(order, user, proofFile);

    return this.findOneForStaff(orderId);
  }

  async uploadFullPaymentProofForClient(
    user: JwtUser,
    orderId: string,
    proofFile: MulterFile | undefined,
  ): Promise<ClientOrderDetail> {
    const client = await this.clientsRepo.findOne({
      where: { userId: user.userId },
    });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }

    const order = await this.ordersRepo.findOne({
      where: { id: orderId, customerId: client.id },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.saveFullPaymentProof(order, user, proofFile);

    return this.findOneForClient(user, orderId);
  }

  async uploadReservationPaymentProofForStaff(
    user: JwtUser,
    orderId: string,
    proofFile: MulterFile | undefined,
  ): Promise<StaffOrderDetail> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.saveReservationPaymentProof(order, user, proofFile);

    return this.findOneForStaff(orderId);
  }

  async uploadReservationPaymentProofForClient(
    user: JwtUser,
    orderId: string,
    proofFile: MulterFile | undefined,
  ): Promise<ClientOrderDetail> {
    const client = await this.clientsRepo.findOne({
      where: { userId: user.userId },
    });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }

    const order = await this.ordersRepo.findOne({
      where: { id: orderId, customerId: client.id },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.saveReservationPaymentProof(order, user, proofFile);

    return this.findOneForClient(user, orderId);
  }

  async uploadInstallmentProofForStaff(
    user: JwtUser,
    orderId: string,
    installmentNumber: number,
    proofFile: MulterFile | undefined,
  ): Promise<StaffOrderDetail> {
    if (!proofFile?.buffer?.length) {
      throw new BadRequestException('Proof file is required');
    }

    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    this.assertInstallmentScheduleAccessible(order);
    await this.ensureInstallments(order, user.userId);

    const mime = proofFile.mimetype?.toLowerCase() ?? '';
    if (!ALLOWED_PROOF_MIMES.has(mime)) {
      throw new BadRequestException(
        `Proof must be an image or PDF (${proofFile.mimetype || 'unknown'})`,
      );
    }

    await this.findInstallmentForOrder(orderId, installmentNumber);

    const ext = extFromProofMime(mime);
    const proofKey = `orders/${orderId}/installments/${installmentNumber}/proof-${randomUUID()}.${ext}`;
    await this.s3.putObject(proofKey, proofFile.buffer, mime);

    await this.installmentsRepo.update(
      { orderId, installmentNumber },
      {
        proofKey,
        proofUploadedAt: new Date(),
        proofUploadedByUserId: user.userId,
        updatedById: user.userId,
      },
    );

    return this.findOneForStaff(orderId);
  }

  async uploadInstallmentProofForClient(
    user: JwtUser,
    orderId: string,
    installmentNumber: number,
    proofFile: MulterFile | undefined,
  ): Promise<ClientOrderDetail> {
    if (!proofFile?.buffer?.length) {
      throw new BadRequestException('Proof file is required');
    }

    const client = await this.clientsRepo.findOne({
      where: { userId: user.userId },
    });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }

    const order = await this.ordersRepo.findOne({
      where: { id: orderId, customerId: client.id },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    this.assertInstallmentScheduleAccessible(order);
    await this.ensureInstallments(order, user.userId);

    const mime = proofFile.mimetype?.toLowerCase() ?? '';
    if (!ALLOWED_PROOF_MIMES.has(mime)) {
      throw new BadRequestException(
        `Proof must be an image or PDF (${proofFile.mimetype || 'unknown'})`,
      );
    }

    await this.findInstallmentForOrder(orderId, installmentNumber);

    const ext = extFromProofMime(mime);
    const proofKey = `orders/${orderId}/installments/${installmentNumber}/proof-${randomUUID()}.${ext}`;
    await this.s3.putObject(proofKey, proofFile.buffer, mime);

    await this.installmentsRepo.update(
      { orderId, installmentNumber },
      {
        proofKey,
        proofUploadedAt: new Date(),
        proofUploadedByUserId: user.userId,
        updatedById: user.userId,
      },
    );

    return this.findOneForClient(user, orderId);
  }

  async createOrderForClient(
    user: JwtUser,
    payloadRaw: string | undefined,
    signatureFile: MulterFile | undefined,
  ): Promise<ClientOrderSummary> {
    if (payloadRaw == null || payloadRaw.trim() === '') {
      throw new BadRequestException('Missing payload');
    }
    if (!signatureFile?.buffer?.length) {
      throw new BadRequestException('Signature image is required');
    }

    let dto: CreateOrderDto;
    try {
      dto = plainToInstance(CreateOrderDto, JSON.parse(payloadRaw) as object, {
        enableImplicitConversion: true,
      });
      await validateOrReject(dto);
    } catch {
      throw new BadRequestException('Invalid order payload');
    }

    if (dto.paymentType === PAYMENT_TYPE_LAYAWAY && dto.layawayMonths == null) {
      throw new BadRequestException(
        'Layaway months are required for layaway orders',
      );
    }

    const mime = signatureFile.mimetype?.toLowerCase() ?? '';
    if (!ALLOWED_IMAGE_MIMES.has(mime)) {
      throw new BadRequestException(
        `Signature must be an image file (${signatureFile.mimetype || 'unknown'})`,
      );
    }

    const client = await this.clientsRepo.findOne({
      where: { userId: user.userId },
    });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }

    const item = await this.inventoryRepo.findOne({
      where: {
        id: dto.inventoryItemId,
        status: INVENTORY_STATUS_AVAILABLE_FOR_PURCHASE,
      },
    });
    if (!item) {
      throw new NotFoundException('Item is not available for purchase');
    }
    if (item.consignorId === client.id) {
      throw new BadRequestException('This is your item and you cannot buy it.');
    }

    const itemPrice = parseItemPrice(item.tbhSellingPrice);
    if (itemPrice == null) {
      throw new BadRequestException('Item price is not set');
    }

    let layawayPrice: string | null = null;
    let layawayMonthlyPayment: string | null = null;
    let fullPaymentPrice: string | null = null;
    let layawayMonths: number | null = null;
    let status: string;
    let holdingHours: number;

    if (dto.paymentType === PAYMENT_TYPE_LAYAWAY) {
      const pricing = calculateLayawayPricing(itemPrice, dto.layawayMonths!);
      if (!pricing) {
        throw new BadRequestException('Invalid layaway terms');
      }
      layawayMonths = dto.layawayMonths!;
      layawayPrice = formatDecimal(pricing.layawayPrice);
      layawayMonthlyPayment = formatDecimal(pricing.monthlyPayment);
      status = ORDER_STATUS_FOR_LAYAWAY_APPROVAL;
      holdingHours = LAYAWAY_HOLDING_HOURS;
    } else {
      fullPaymentPrice = formatDecimal(itemPrice);
      status = ORDER_STATUS_FOR_PAYMENT;
      holdingHours = FULL_PAYMENT_HOLDING_HOURS;
    }

    const ext = extFromMime(mime);
    const orderId = randomUUID();
    const signatureKey = `orders/${orderId}/signature-${randomUUID()}.${ext}`;
    await this.s3.putObject(signatureKey, signatureFile.buffer, mime);

    const saved = await this.dataSource.transaction(async (em) => {
      await em.query('SELECT pg_advisory_xact_lock($1)', [834729105]);

      const maxRow = await em
        .createQueryBuilder(Order, 'o')
        .select('MAX(o.orderNumber)', 'max')
        .getRawOne<{ max: string | null }>();
      const orderNumber = nextOrderNumber(
        maxRow?.max ? Number(maxRow.max) : null,
      );

      const createdAt = new Date();
      const order = em.create(Order, {
        id: orderId,
        orderNumber,
        status,
        inventoryItemId: item.id,
        customerId: client.id,
        paymentType: dto.paymentType,
        layawayMonths,
        layawayPrice,
        layawayMonthlyPayment,
        fullPaymentPrice,
        signatureKey,
        holdingPeriod: addHours(createdAt, holdingHours),
        createdById: user.userId,
        updatedById: user.userId,
      });
      await em.save(order);

      item.status = INVENTORY_STATUS_ON_HOLD;
      item.updatedById = user.userId;
      await em.save(item);

      return order;
    });

    return this.toClientSummary(saved);
  }

  async createReservationForClient(
    user: JwtUser,
    payloadRaw: string | undefined,
    proofFile: MulterFile | undefined,
    signatureFile: MulterFile | undefined,
  ): Promise<ClientOrderSummary> {
    if (payloadRaw == null || payloadRaw.trim() === '') {
      throw new BadRequestException('Missing payload');
    }
    if (!proofFile?.buffer?.length) {
      throw new BadRequestException('Reservation payment proof is required');
    }
    if (!signatureFile?.buffer?.length) {
      throw new BadRequestException('Signature image is required');
    }

    let dto: CreateReservationOrderDto;
    try {
      dto = plainToInstance(
        CreateReservationOrderDto,
        JSON.parse(payloadRaw) as object,
        { enableImplicitConversion: true },
      );
      await validateOrReject(dto);
    } catch {
      throw new BadRequestException('Invalid reservation payload');
    }

    const proofMime = proofFile.mimetype?.toLowerCase() ?? '';
    if (!ALLOWED_PROOF_MIMES.has(proofMime)) {
      throw new BadRequestException(
        `Proof must be an image or PDF (${proofFile.mimetype || 'unknown'})`,
      );
    }

    const signatureMime = signatureFile.mimetype?.toLowerCase() ?? '';
    if (!ALLOWED_IMAGE_MIMES.has(signatureMime)) {
      throw new BadRequestException(
        `Signature must be an image file (${signatureFile.mimetype || 'unknown'})`,
      );
    }

    const client = await this.clientsRepo.findOne({
      where: { userId: user.userId },
    });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }

    const item = await this.inventoryRepo.findOne({
      where: {
        id: dto.inventoryItemId,
        status: INVENTORY_STATUS_AVAILABLE_FOR_PURCHASE,
      },
    });
    if (!item) {
      throw new NotFoundException('Item is not available for purchase');
    }
    if (item.consignorId === client.id) {
      throw new BadRequestException('This is your item and you cannot buy it.');
    }

    const orderId = randomUUID();
    const signatureKey = `orders/${orderId}/signature-${randomUUID()}.${extFromMime(signatureMime)}`;
    const proofKey = `orders/${orderId}/reservation/proof-${randomUUID()}.${extFromProofMime(proofMime)}`;
    await this.s3.putObject(signatureKey, signatureFile.buffer, signatureMime);
    await this.s3.putObject(proofKey, proofFile.buffer, proofMime);

    const saved = await this.dataSource.transaction(async (em) => {
      await em.query('SELECT pg_advisory_xact_lock($1)', [834729105]);

      const maxRow = await em
        .createQueryBuilder(Order, 'o')
        .select('MAX(o.orderNumber)', 'max')
        .getRawOne<{ max: string | null }>();
      const orderNumber = nextOrderNumber(
        maxRow?.max ? Number(maxRow.max) : null,
      );

      const createdAt = new Date();
      const order = em.create(Order, {
        id: orderId,
        orderNumber,
        status: ORDER_STATUS_RESERVATION,
        inventoryItemId: item.id,
        customerId: client.id,
        paymentType: PAYMENT_TYPE_FULL,
        layawayMonths: null,
        layawayPrice: null,
        layawayMonthlyPayment: null,
        fullPaymentPrice: formatDecimal(RESERVATION_FEE),
        reservationPaymentProofKey: proofKey,
        reservationPaymentProofUploadedAt: createdAt,
        reservationPaymentProofUploadedByUserId: user.userId,
        signatureKey,
        holdingPeriod: addHours(createdAt, RESERVATION_HOLDING_HOURS),
        createdById: user.userId,
        updatedById: user.userId,
      });
      await em.save(order);

      item.status = INVENTORY_STATUS_ON_HOLD;
      item.updatedById = user.userId;
      await em.save(item);

      return order;
    });

    return this.toClientSummary(saved);
  }

  async expireOrdersPastHoldingPeriod(): Promise<number> {
    const now = new Date();
    const candidates = await this.ordersRepo
      .createQueryBuilder('o')
      .innerJoinAndSelect('o.inventoryItem', 'item')
      .where('o.status IN (:...statuses)', {
        statuses: [
          ORDER_STATUS_FOR_PAYMENT,
          ORDER_STATUS_FOR_LAYAWAY_APPROVAL,
          ORDER_STATUS_RESERVATION,
        ],
      })
      .andWhere('o.holding_period IS NOT NULL')
      .andWhere('o.holding_period <= :now', { now })
      .andWhere('item.status = :onHold', { onHold: INVENTORY_STATUS_ON_HOLD })
      .getMany();

    let expiredCount = 0;
    for (const order of candidates) {
      const didExpire = await this.dataSource.transaction(async (em) => {
        const lockedOrder = await em.findOne(Order, {
          where: { id: order.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (
          !lockedOrder ||
          (lockedOrder.status !== ORDER_STATUS_FOR_PAYMENT &&
            lockedOrder.status !== ORDER_STATUS_FOR_LAYAWAY_APPROVAL &&
            lockedOrder.status !== ORDER_STATUS_RESERVATION)
        ) {
          return false;
        }

        const lockedItem = await em.findOne(InventoryItem, {
          where: { id: order.inventoryItemId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!lockedItem || lockedItem.status !== INVENTORY_STATUS_ON_HOLD) {
          return false;
        }

        lockedItem.status = INVENTORY_STATUS_AVAILABLE_FOR_PURCHASE;
        await em.save(lockedItem);

        lockedOrder.status = ORDER_STATUS_EXPIRED;
        await em.save(lockedOrder);
        return true;
      });

      if (didExpire) expiredCount += 1;
    }

    return expiredCount;
  }

  private toClientSummary(order: Order): ClientOrderSummary {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      inventoryItemId: order.inventoryItemId,
      paymentType: order.paymentType,
      layawayMonths: order.layawayMonths,
      layawayPrice: order.layawayPrice,
      layawayMonthlyPayment: order.layawayMonthlyPayment,
      fullPaymentPrice: order.fullPaymentPrice,
      holdingPeriod: order.holdingPeriod?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
    };
  }
}
