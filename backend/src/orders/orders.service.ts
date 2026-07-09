import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { JwtUser } from '../auth/jwt-user';
import { Client } from '../clients/entities/client.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { ItemAuthentication } from '../inventory/entities/item-authentication.entity';
import type { MulterFile } from '../inquiries/multer-file.type';
import { MediaOwnerType } from '../enums/media-owner-type.enum';
import { MediaPurpose } from '../enums/media-purpose.enum';
import { MediaService } from '../media/media.service';
import { MailService } from '../mail/mail.service';
import { computeConsignorPaymentAuditDate } from '../consignor-payments/consignor-payment-audit-date.util';
import { ConsignorPaymentsService } from '../consignor-payments/consignor-payments.service';
import { ApproveLayawayOrderDto } from './dto/approve-layaway-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateReservationOrderDto } from './dto/create-reservation-order.dto';
import { DeclineLayawayOrderDto } from './dto/decline-layaway-order.dto';
import { UpdateInstallmentAmountPaidDto } from './dto/update-installment-amount-paid.dto';
import { UpdateLayawayTermsDto } from './dto/update-layaway-terms.dto';
import { OrderInstallment } from './entities/order-installment.entity';
import { Order } from './entities/order.entity';
import { Waitlist } from './entities/waitlist.entity';
import {
  categoryFromItemSnapshot,
  getLayawayEligibility,
} from './layaway-eligibility.util';
import { calculateLayawayPricing } from './layaway-pricing.util';
import {
  buildScheduledAmounts,
  computeAmountDueForInstallment,
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
  INVENTORY_STATUS_OUT_FOR_DELIVERY,
  INVENTORY_STATUS_SOLD_UNDER_WARRANTY,
  INVENTORY_STATUS_RESERVED_LAYAWAY,
  LAYAWAY_HOLDING_HOURS,
  ORDER_STATUS_CANCELLED,
  ORDER_STATUS_DECLINED,
  ORDER_STATUS_EXPIRED,
  ORDER_STATUS_FOR_LAYAWAY_APPROVAL,
  ORDER_STATUS_FOR_PAYMENT,
  ORDER_STATUS_ITEM_RECEIVED,
  ORDER_STATUS_OUT_FOR_DELIVERY,
  ORDER_STATUS_PAID,
  ORDER_STATUS_RESERVATION,
  ORDER_INSTALLMENT_STATUS_PAID,
  ORDER_INSTALLMENT_STATUS_UNPAID,
  ORDER_NUMBER_OFFSET,
  PAYMENT_TYPE_FULL,
  PAYMENT_TYPE_LAYAWAY,
  RESERVATION_HOLDING_HOURS,
  SHIPPING_FEE_CARE_OF_OPTIONS,
  SHIPPING_FEE_CARE_OF_TBH,
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

function assertConsignorPaymentReleaseWithinTerms(
  consignorPaymentRelease: number,
  layawayMonths: number | null | undefined,
): void {
  if (
    layawayMonths == null ||
    layawayMonths <= 0 ||
    consignorPaymentRelease < 1 ||
    consignorPaymentRelease > layawayMonths
  ) {
    throw new BadRequestException(
      'Consignor payment release must be within the layaway term',
    );
  }
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
  shippingFeeCareOf: string | null;
  shippingFeeProofUrl: string | null;
  holdingPeriod: string | null;
  layawayPaymentStartDate: string | null;
  consignorPaymentRelease: number | null;
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
  private readonly logger = new Logger(OrdersService.name);

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
    @InjectRepository(ItemAuthentication)
    private readonly itemAuthRepo: Repository<ItemAuthentication>,
    private readonly dataSource: DataSource,
    private readonly media: MediaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly consignorPaymentsService: ConsignorPaymentsService,
  ) {}

  private async getInstallmentViewsForOrder(
    order: Order,
  ): Promise<OrderInstallmentView[]> {
    if (
      order.paymentType !== PAYMENT_TYPE_LAYAWAY ||
      (order.status !== ORDER_STATUS_FOR_PAYMENT &&
        order.status !== ORDER_STATUS_PAID &&
        order.status !== ORDER_STATUS_OUT_FOR_DELIVERY &&
        order.status !== ORDER_STATUS_ITEM_RECEIVED) ||
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
    const proofUrlByInstallmentId = new Map<string, string | null>();
    for (const row of rows) {
      proofUrlByInstallmentId.set(
        row.id,
        await this.media.findFirstUrl(
          MediaOwnerType.ORDER_INSTALLMENT,
          row.id,
          MediaPurpose.PAYMENT_PROOF,
        ),
      );
    }
    return computeInstallmentViews(
      rows,
      formatOrderDate(order.layawayPaymentStartDate),
      (row) => proofUrlByInstallmentId.get(row.id) ?? null,
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
    const storageKey = `orders/${order.id}/full-payment/proof-${randomUUID()}.${ext}`;

    if (
      order.status === ORDER_STATUS_RESERVATION &&
      !(await this.media.hasMedia(
        MediaOwnerType.ORDER,
        order.id,
        MediaPurpose.PAYMENT_PROOF,
        { proofType: 'reservation' },
      ))
    ) {
      const existingFull = await this.media.findByOwner(
        MediaOwnerType.ORDER,
        order.id,
        {
          purpose: MediaPurpose.PAYMENT_PROOF,
          metadata: { proofType: 'full' },
          orderBySort: true,
        },
      );
      if (existingFull[0]) {
        await this.media.create({
          storageKey: existingFull[0].storageKey,
          contentType: existingFull[0].contentType,
          byteSize:
            existingFull[0].byteSize != null
              ? Number(existingFull[0].byteSize)
              : null,
          originalFilename: existingFull[0].originalFilename,
          ownerType: MediaOwnerType.ORDER,
          ownerId: order.id,
          purpose: MediaPurpose.PAYMENT_PROOF,
          sortOrder: 0,
          uploadedByUserId: existingFull[0].uploadedByUserId,
          createdById: existingFull[0].createdById,
          metadata: { proofType: 'reservation' },
        });
        await this.ordersRepo.update(order.id, {
          reservationPaymentProofUploadedAt: order.fullPaymentProofUploadedAt,
          reservationPaymentProofUploadedByUserId:
            order.fullPaymentProofUploadedByUserId,
          updatedById: user.userId,
        });
      }
    }

    await this.media.replaceSingle(
      MediaOwnerType.ORDER,
      order.id,
      MediaPurpose.PAYMENT_PROOF,
      proofFile,
      storageKey,
      {
        uploadedByUserId: user.userId,
        createdById: user.userId,
        metadata: { proofType: 'full' },
      },
    );

    await this.ordersRepo.update(order.id, {
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
    const storageKey = `orders/${order.id}/reservation/proof-${randomUUID()}.${ext}`;
    await this.media.replaceSingle(
      MediaOwnerType.ORDER,
      order.id,
      MediaPurpose.PAYMENT_PROOF,
      proofFile,
      storageKey,
      {
        uploadedByUserId: user.userId,
        createdById: user.userId,
        metadata: { proofType: 'reservation' },
      },
    );

    await this.ordersRepo.update(order.id, {
      reservationPaymentProofUploadedAt: new Date(),
      reservationPaymentProofUploadedByUserId: user.userId,
      updatedById: user.userId,
    });
  }

  private async reservationPaymentProofUrl(order: Order): Promise<string | null> {
    const reservation = await this.media.findFirstUrl(
      MediaOwnerType.ORDER,
      order.id,
      MediaPurpose.PAYMENT_PROOF,
      { proofType: 'reservation' },
    );
    if (reservation) return reservation;
    if (order.status === ORDER_STATUS_RESERVATION) {
      return this.media.findFirstUrl(
        MediaOwnerType.ORDER,
        order.id,
        MediaPurpose.PAYMENT_PROOF,
        { proofType: 'full' },
      );
    }
    return null;
  }

  private async fullPaymentProofUrl(order: Order): Promise<string | null> {
    if (
      order.status === ORDER_STATUS_RESERVATION &&
      !(await this.media.hasMedia(
        MediaOwnerType.ORDER,
        order.id,
        MediaPurpose.PAYMENT_PROOF,
        { proofType: 'reservation' },
      ))
    ) {
      return null;
    }
    return this.media.findFirstUrl(
      MediaOwnerType.ORDER,
      order.id,
      MediaPurpose.PAYMENT_PROOF,
      { proofType: 'full' },
    );
  }

  private async shippingFeeProofUrl(order: Order): Promise<string | null> {
    return this.media.findFirstUrl(
      MediaOwnerType.ORDER,
      order.id,
      MediaPurpose.PAYMENT_PROOF,
      { proofType: 'shipping_fee' },
    );
  }

  private async signatureUrlForOrder(orderId: string): Promise<string | null> {
    return this.media.findFirstUrl(
      MediaOwnerType.ORDER,
      orderId,
      MediaPurpose.SIGNATURE,
    );
  }

  private catalogUrl(): string {
    const origin = this.config
      .get<string>('FRONTEND_ORIGIN', 'http://localhost:5173')
      .replace(/\/$/, '');
    return `${origin}/catalog`;
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
      reservationPaymentProofUrl: await this.reservationPaymentProofUrl(order),
      fullPaymentProofUrl: await this.fullPaymentProofUrl(order),
      holdingPeriod: order.holdingPeriod?.toISOString() ?? null,
      declineReason: order.declineReason,
      signatureUrl: await this.signatureUrlForOrder(order.id),
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
      reservationPaymentProofUrl: await this.reservationPaymentProofUrl(order),
      fullPaymentProofUrl: await this.fullPaymentProofUrl(order),
      shippingFeeCareOf: order.shippingFeeCareOf,
      shippingFeeProofUrl: await this.shippingFeeProofUrl(order),
      holdingPeriod: order.holdingPeriod?.toISOString() ?? null,
      layawayPaymentStartDate: formatOrderDate(order.layawayPaymentStartDate),
      consignorPaymentRelease: order.consignorPaymentRelease,
      declineReason: order.declineReason,
      signatureUrl: await this.signatureUrlForOrder(order.id),
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
    dto: ApproveLayawayOrderDto,
  ): Promise<StaffOrderDetail> {
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
          'Only orders awaiting layaway approval can be approved',
        );
      }
      if (order.paymentType !== PAYMENT_TYPE_LAYAWAY) {
        throw new BadRequestException('Order is not a layaway order');
      }
      assertConsignorPaymentReleaseWithinTerms(
        dto.consignorPaymentRelease,
        order.layawayMonths,
      );

      const item = await em.findOne(InventoryItem, {
        where: { id: order.inventoryItemId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) {
        throw new NotFoundException('Inventory item not found');
      }

      order.status = ORDER_STATUS_FOR_PAYMENT;
      order.layawayPaymentStartDate = todayDateString();
      order.consignorPaymentRelease = dto.consignorPaymentRelease;
      order.updatedById = user.userId;
      await em.save(order);

      item.status = INVENTORY_STATUS_RESERVED_LAYAWAY;
      item.updatedById = user.userId;
      await em.save(item);

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
    assertConsignorPaymentReleaseWithinTerms(
      dto.consignorPaymentRelease,
      dto.layawayMonths,
    );

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
      order.consignorPaymentRelease = dto.consignorPaymentRelease;
      order.status = ORDER_STATUS_FOR_PAYMENT;
      order.layawayPaymentStartDate = todayDateString();
      order.updatedById = user.userId;
      await em.save(order);

      const item = await em.findOne(InventoryItem, {
        where: { id: order.inventoryItemId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) {
        throw new NotFoundException('Inventory item not found');
      }

      item.status = INVENTORY_STATUS_RESERVED_LAYAWAY;
      item.updatedById = user.userId;
      await em.save(item);

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
        order.status !== ORDER_STATUS_PAID &&
        order.status !== ORDER_STATUS_RESERVATION
      ) {
        throw new BadRequestException(
          'Only reservation, payment, or paid orders can be cancelled',
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
      throw new BadRequestException(
        'Layaway orders are marked as paid automatically when the last installment is marked as paid',
      );
    } else if (order.paymentType === PAYMENT_TYPE_FULL) {
      if (
        order.status !== ORDER_STATUS_FOR_PAYMENT &&
        order.status !== ORDER_STATUS_RESERVATION
      ) {
        throw new BadRequestException(
          'Only full payment orders awaiting payment or reserved can be marked as paid',
        );
      }
      if (
        !(await this.media.hasMedia(
          MediaOwnerType.ORDER,
          order.id,
          MediaPurpose.PAYMENT_PROOF,
          { proofType: 'full' },
        ))
      ) {
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

  async markOutForDeliveryForStaff(
    user: JwtUser,
    id: string,
    shippingFeeCareOfRaw: string | undefined,
    proofFile: MulterFile | undefined,
  ): Promise<StaffOrderDetail> {
    const shippingFeeCareOf = shippingFeeCareOfRaw?.trim() ?? '';
    if (
      !SHIPPING_FEE_CARE_OF_OPTIONS.includes(
        shippingFeeCareOf as (typeof SHIPPING_FEE_CARE_OF_OPTIONS)[number],
      )
    ) {
      throw new BadRequestException(
        'Shipping fee care of must be The Bag Hub or Client',
      );
    }

    if (shippingFeeCareOf === SHIPPING_FEE_CARE_OF_TBH) {
      if (!proofFile?.buffer?.length) {
        throw new BadRequestException(
          'Proof of payment for shipping fee is required when The Bag Hub covers shipping',
        );
      }
      const mime = proofFile.mimetype?.toLowerCase() ?? '';
      if (!ALLOWED_PROOF_MIMES.has(mime)) {
        throw new BadRequestException(
          `Proof must be an image or PDF (${proofFile.mimetype || 'unknown'})`,
        );
      }
    }

    let waitlistRecipients: Array<{
      email: string;
      firstName: string;
      itemLabel: string;
    }> = [];

    await this.dataSource.transaction(async (em) => {
      const order = await em.findOne(Order, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        throw new NotFoundException('Order not found');
      }
      if (order.status !== ORDER_STATUS_PAID) {
        throw new BadRequestException(
          'Only paid orders can be marked as out for delivery',
        );
      }

      const item = await em.findOne(InventoryItem, {
        where: { id: order.inventoryItemId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) {
        throw new NotFoundException('Inventory item not found');
      }

      if (shippingFeeCareOf === SHIPPING_FEE_CARE_OF_TBH && proofFile) {
        const mime = proofFile.mimetype!.toLowerCase();
        const ext = extFromProofMime(mime);
        const storageKey = `orders/${order.id}/shipping-fee/proof-${randomUUID()}.${ext}`;
        await this.media.replaceSingle(
          MediaOwnerType.ORDER,
          order.id,
          MediaPurpose.PAYMENT_PROOF,
          proofFile,
          storageKey,
          {
            uploadedByUserId: user.userId,
            createdById: user.userId,
            metadata: { proofType: 'shipping_fee' },
          },
        );
        order.shippingFeeProofUploadedAt = new Date();
        order.shippingFeeProofUploadedByUserId = user.userId;
      } else {
        order.shippingFeeProofUploadedAt = null;
        order.shippingFeeProofUploadedByUserId = null;
      }

      item.status = INVENTORY_STATUS_OUT_FOR_DELIVERY;
      item.updatedById = user.userId;
      await em.save(item);

      order.status = ORDER_STATUS_OUT_FOR_DELIVERY;
      order.shippingFeeCareOf = shippingFeeCareOf;
      order.updatedById = user.userId;
      await em.save(order);

      const waitlistRows = await em.find(Waitlist, {
        where: { inventoryItemId: item.id },
        relations: { client: true },
      });
      const itemLabel = itemLabelFromSnapshot(item);
      waitlistRecipients = waitlistRows
        .filter((row) => row.clientId !== order.customerId)
        .map((row) => ({
          email: row.client.email.trim(),
          firstName: row.client.firstName.trim() || 'there',
          itemLabel,
        }));

      if (waitlistRows.length > 0) {
        await em.delete(Waitlist, { inventoryItemId: item.id });
      }
    });

    if (waitlistRecipients.length > 0) {
      this.notifyWaitlistedClientsItemSold(waitlistRecipients).catch((err) => {
        this.logger.error(
          `Failed to notify waitlisted clients for order ${id}`,
          err instanceof Error ? err.stack : String(err),
        );
      });
    }

    return this.findOneForStaff(id);
  }

  async markItemReceivedForStaff(
    user: JwtUser,
    orderId: string,
  ): Promise<StaffOrderDetail> {
    await this.markItemReceivedInternal(user, orderId, null);
    return this.findOneForStaff(orderId);
  }

  async markItemReceivedForClient(
    user: JwtUser,
    orderId: string,
  ): Promise<ClientOrderDetail> {
    const client = await this.clientsRepo.findOne({
      where: { userId: user.userId },
    });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }

    await this.markItemReceivedInternal(user, orderId, client.id);
    return this.findOneForClient(user, orderId);
  }

  private async markItemReceivedInternal(
    user: JwtUser,
    orderId: string,
    customerId: string | null,
  ): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      const order = await em.findOne(Order, {
        where: customerId
          ? { id: orderId, customerId }
          : { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        throw new NotFoundException('Order not found');
      }
      if (order.status !== ORDER_STATUS_OUT_FOR_DELIVERY) {
        throw new BadRequestException(
          'Only orders out for delivery can be marked as item received',
        );
      }

      const item = await em.findOne(InventoryItem, {
        where: { id: order.inventoryItemId },
        relations: { inquiry: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) {
        throw new NotFoundException('Inventory item not found');
      }
      if (item.status !== INVENTORY_STATUS_OUT_FOR_DELIVERY) {
        throw new BadRequestException(
          'Inventory item is not out for delivery',
        );
      }

      order.status = ORDER_STATUS_ITEM_RECEIVED;
      order.updatedById = user.userId;
      await em.save(order);

      const dateSoldAt = new Date();
      item.status = INVENTORY_STATUS_SOLD_UNDER_WARRANTY;
      item.dateSold = dateSoldAt;
      item.updatedById = user.userId;
      await em.save(item);

      if (
        item.inquiryId &&
        item.transactionType === 'consignment' &&
        order.paymentType !== PAYMENT_TYPE_LAYAWAY
      ) {
        const consignorClientId =
          item.consignorId ?? item.inquiry?.consignorId ?? null;
        if (consignorClientId) {
          const auditDate = computeConsignorPaymentAuditDate(dateSoldAt);
          await this.consignorPaymentsService.recordItemForSoldFinalConsignment(
            em,
            {
              inquiryId: item.inquiryId,
              consignorClientId,
              auditDate,
            },
          );
        }
      }
    });
  }

  private async notifyWaitlistedClientsItemSold(
    recipients: Array<{ email: string; firstName: string; itemLabel: string }>,
  ): Promise<void> {
    if (!this.mail.isConfigured()) {
      this.logger.debug(
        'MAIL_* not configured; skipping waitlist sold notifications',
      );
      return;
    }

    const catalogUrl = this.catalogUrl();
    await Promise.all(
      recipients.map((recipient) =>
        this.mail.sendWaitlistItemSoldNotice({
          to: recipient.email,
          firstName: recipient.firstName,
          itemLabel: recipient.itemLabel,
          catalogUrl,
        }),
      ),
    );
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

  async markInstallmentPaidForStaff(
    user: JwtUser,
    orderId: string,
    installmentNumber: number,
  ): Promise<StaffOrderDetail> {
    await this.dataSource.transaction(async (em) => {
      const order = await em.findOne(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        throw new NotFoundException('Order not found');
      }
      this.assertInstallmentScheduleAccessible(order);
      await this.ensureInstallments(order, user.userId);

      const rows = await em.find(OrderInstallment, {
        where: { orderId },
        order: { installmentNumber: 'ASC' },
      });
      const row = rows.find((r) => r.installmentNumber === installmentNumber);
      if (!row) {
        throw new NotFoundException('Installment not found');
      }

      const currentStatus = row.status?.trim() || ORDER_INSTALLMENT_STATUS_UNPAID;
      if (currentStatus === ORDER_INSTALLMENT_STATUS_PAID) {
        throw new BadRequestException('Installment is already marked as paid');
      }

      const amountDue = computeAmountDueForInstallment(rows, installmentNumber);
      const amountPaid = parseMoney(row.amountPaid);
      if (Math.round(amountPaid * 100) < Math.round(amountDue * 100)) {
        throw new BadRequestException(
          `Amount paid must be at least ${formatMoney(amountDue)} for this installment`,
        );
      }

      const hasProof = await this.media.hasMedia(
        MediaOwnerType.ORDER_INSTALLMENT,
        row.id,
        MediaPurpose.PAYMENT_PROOF,
      );
      if (!hasProof) {
        throw new BadRequestException(
          'Upload proof of payment before marking this installment as paid',
        );
      }

      const markedPaidAt = new Date();
      row.status = ORDER_INSTALLMENT_STATUS_PAID;
      row.markedPaidAt = markedPaidAt;
      row.updatedById = user.userId;
      await em.save(row);

      if (
        order.consignorPaymentRelease != null &&
        installmentNumber === order.consignorPaymentRelease
      ) {
        const item = await em.findOne(InventoryItem, {
          where: { id: order.inventoryItemId },
          relations: { inquiry: true },
        });
        if (item?.inquiryId && item.transactionType === 'consignment') {
          const consignorClientId =
            item.consignorId ?? item.inquiry?.consignorId ?? null;
          if (consignorClientId) {
            const auditDate = computeConsignorPaymentAuditDate(markedPaidAt);
            await this.consignorPaymentsService.recordItemForSoldFinalConsignment(
              em,
              {
                inquiryId: item.inquiryId,
                consignorClientId,
                auditDate,
              },
            );
          }
        }
      }

      if (
        order.layawayMonths != null &&
        installmentNumber === order.layawayMonths
      ) {
        order.status = ORDER_STATUS_PAID;
        order.updatedById = user.userId;
        await em.save(order);
      }
    });

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

    const installment = await this.findInstallmentForOrder(orderId, installmentNumber);

    const ext = extFromProofMime(mime);
    const storageKey = `orders/${orderId}/installments/${installmentNumber}/proof-${randomUUID()}.${ext}`;
    await this.media.replaceSingle(
      MediaOwnerType.ORDER_INSTALLMENT,
      installment.id,
      MediaPurpose.PAYMENT_PROOF,
      proofFile,
      storageKey,
      {
        uploadedByUserId: user.userId,
        createdById: user.userId,
      },
    );

    await this.installmentsRepo.update(
      { orderId, installmentNumber },
      {
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

    const installment = await this.findInstallmentForOrder(orderId, installmentNumber);

    const ext = extFromProofMime(mime);
    const storageKey = `orders/${orderId}/installments/${installmentNumber}/proof-${randomUUID()}.${ext}`;
    await this.media.replaceSingle(
      MediaOwnerType.ORDER_INSTALLMENT,
      installment.id,
      MediaPurpose.PAYMENT_PROOF,
      proofFile,
      storageKey,
      {
        uploadedByUserId: user.userId,
        createdById: user.userId,
      },
    );

    await this.installmentsRepo.update(
      { orderId, installmentNumber },
      {
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
      const auth = await this.itemAuthRepo.findOne({
        where: { inventoryItemId: item.id },
      });
      const layawayEligibility = getLayawayEligibility(
        auth?.rating ?? null,
        categoryFromItemSnapshot(item.itemSnapshot),
      );
      if (!layawayEligibility.allowed) {
        throw new BadRequestException(layawayEligibility.reasons.join(' '));
      }

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
    await this.media.replaceSingle(
      MediaOwnerType.ORDER,
      orderId,
      MediaPurpose.SIGNATURE,
      signatureFile,
      signatureKey,
      {
        uploadedByUserId: user.userId,
        createdById: user.userId,
      },
    );

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
    await this.media.replaceSingle(
      MediaOwnerType.ORDER,
      orderId,
      MediaPurpose.SIGNATURE,
      signatureFile,
      signatureKey,
      {
        uploadedByUserId: user.userId,
        createdById: user.userId,
      },
    );
    await this.media.replaceSingle(
      MediaOwnerType.ORDER,
      orderId,
      MediaPurpose.PAYMENT_PROOF,
      proofFile,
      proofKey,
      {
        uploadedByUserId: user.userId,
        createdById: user.userId,
        metadata: { proofType: 'reservation' },
      },
    );

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
        reservationPaymentProofUploadedAt: createdAt,
        reservationPaymentProofUploadedByUserId: user.userId,
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
