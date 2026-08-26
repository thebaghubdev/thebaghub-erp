import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { FeatureAccessService } from '../access-control/feature-access.service';
import { JwtUser } from '../auth/jwt-user';
import { ClientActivityTotalsService } from '../clients/client-activity-totals.service';
import { Client } from '../clients/entities/client.entity';
import { VipPricingService } from '../clients/vip-pricing.service';
import type { VipDiscountTier } from '../clients/vip-discount.util';
import { Employee } from '../employees/entities/employee.entity';
import {
  canAssignWorkToOthers,
  GENERAL_MANAGER_POSITION,
  isGeneralManagerPosition,
} from '../employees/employee-position.util';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import {
  InventoryAuditService,
  cloneInventoryItemForAudit,
} from '../inventory/inventory-audit.service';
import { effectiveInventoryUnitPrice } from '../inventory/inventory-effective-price.util';
import { computeCreditCardPriceFromTbh } from '../inventory/credit-card-price.util';
import { calendarDateStringInTimeZone } from '../inventory/sold-warranty.util';
import { Inquiry } from '../inquiries/entities/inquiry.entity';
import { ItemAuthentication } from '../inventory/entities/item-authentication.entity';
import type { MulterFile } from '../inquiries/multer-file.type';
import { MediaOwnerType } from '../enums/media-owner-type.enum';
import { MediaPurpose } from '../enums/media-purpose.enum';
import { UserType } from '../enums/user-type.enum';
import { MediaService } from '../media/media.service';
import { MailService } from '../mail/mail.service';
import { computeConsignorPaymentAuditDate } from '../consignor-payments/consignor-payment-audit-date.util';
import { ConsignorPaymentsService } from '../consignor-payments/consignor-payments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { portalPageUrl } from '../common/frontend-url.util';
import { TasksService } from '../tasks/tasks.service';
import { PaymentVerificationNotifyService } from '../payment-verification/payment-verification-notify.service';
import {
  isPaymentAwaitingVerification,
  PAYMENT_STATUS_CONFIRMED,
  PAYMENT_STATUS_FOR_VERIFICATION,
} from '../payment-verification/payment-status.util';
import {
  cloneInstallmentForAudit,
  cloneOrderForAudit,
  clonePaymentForAudit,
  OrderAuditService,
  type OrderAuditActor,
} from './order-audit.service';
import { ApplyVoucherDto } from './dto/apply-voucher.dto';
import { ApproveLayawayOrderDto } from './dto/approve-layaway-order.dto';
import { BatchAssignSalesAssociateDto } from './dto/batch-assign-sales-associate.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { ConvertToLayawayDto } from './dto/convert-to-layaway.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateStaffOrderDto } from './dto/create-staff-order.dto';
import { CreateReservationOrderDto } from './dto/create-reservation-order.dto';
import { DeclineLayawayOrderDto } from './dto/decline-layaway-order.dto';
import { MarkInstallmentPaidDto } from './dto/mark-installment-paid.dto';
import { MarkOrderPaymentPaidDto } from './dto/mark-order-payment-paid.dto';
import { UpdateInstallmentAmountPaidDto } from './dto/update-installment-amount-paid.dto';
import { UpdateInstallmentDueDateDto } from './dto/update-installment-due-date.dto';
import { UpdateInstallmentPaymentDateDto } from './dto/update-installment-payment-date.dto';
import { UpdateLayawayTermsDto } from './dto/update-layaway-terms.dto';
import { UpdateOrderPaymentAmountPaidDto } from './dto/update-order-payment-amount-paid.dto';
import { UpdateOrderPaymentDateDto } from './dto/update-order-payment-date.dto';
import { UpdateOrderTotalPriceDto } from './dto/update-order-total-price.dto';
import { OrderInstallment } from './entities/order-installment.entity';
import { OrderPayment } from './entities/order-payment.entity';
import { Order } from './entities/order.entity';
import { Waitlist } from './entities/waitlist.entity';
import {
  categoryFromItemSnapshot,
  getLayawayEligibility,
} from './layaway-eligibility.util';
import { calculateLayawayPricing } from './layaway-pricing.util';
import {
  PENALTY_WAIVE_STATUS_APPROVED,
  PENALTY_WAIVE_STATUS_PENDING,
} from './installment-penalty.constants';
import {
  buildScheduledAmounts,
  computeAmountDueForInstallment,
  computeAutoPenalty,
  computeDefaultDueDate,
  computeInstallmentViews,
  computeRemainingBalance,
  applyPaymentCreditToInstallments,
  effectiveDueDateForInstallment,
  formatMoney,
  isInstallmentPaidStatus,
  isInstallmentAwaitingVerification,
  isPenaltyAmountFrozen,
  isPenaltyWaivePending,
  isPenaltyWaived,
  parseMoney,
  resolveInstallmentPenalty,
  shouldIncludeInstallmentSchedule,
  type OrderInstallmentView,
} from './order-installment.util';
import {
  buildOrderPaymentViews,
  computeFullPaymentCredit,
  computeOrderPaymentRemainingBalance,
  PAYMENT_MODE_CREDIT_VOUCHER,
  shouldIncludeOrderPayments,
  shouldLoadOrderPaymentViews,
  type OrderPaymentView,
} from './order-payment.util';
import {
  computeVoucherAppliedAmount,
  isVoucherApplicableOrderStatus,
} from './order-voucher-payment.util';
import { Voucher } from '../vouchers/entities/voucher.entity';
import {
  VOUCHER_STATUS_ACTIVE,
  VOUCHER_STATUS_REDEEMED,
} from '../vouchers/voucher-status.constants';
import {
  isOrderOpenForStaffUpdates,
  isSalesAdminPosition,
  isSalesAssociatePosition,
} from './order-assignment.util';
import {
  PICKUP_OPTION_COURIER,
} from './order-pickup.constants';
import { resolveOrderPickupFields } from './order-pickup-fields.util';
import {
  isCreditLinePaymentType,
  installmentApprovalStatusForPaymentType,
  isInstallmentApprovalStatus,
  isInstallmentPaymentType,
} from './order-payment-type.util';
import {
  consignorPricePesosFromOffer,
  purchaseAmountPesosFromOrder,
} from './order-purchase-amount.util';
import {
  emptyDailySalesByTierRow,
  isSoldOrderStatus,
  salesPriceTierKey,
  suggestDailySalesYAxisMax,
  type DailySalesByTierRow,
} from './order-sales-tier.util';
import {
  FULL_PAYMENT_HOLDING_HOURS,
  INVENTORY_STATUS_AVAILABLE_FOR_PURCHASE,
  INVENTORY_STATUS_FOR_PICKUP,
  INVENTORY_STATUS_ON_HOLD,
  INVENTORY_STATUS_SOLD_UNDER_WARRANTY,
  INVENTORY_STATUS_RESERVED_LAYAWAY,
  LAYAWAY_HOLDING_HOURS,
  ORDER_STATUS_CANCELLED,
  ORDER_STATUS_DECLINED,
  ORDER_STATUS_EXPIRED,
  ORDER_STATUS_FOR_LAYAWAY_APPROVAL,
  ORDER_STATUS_FOR_CREDIT_LINE_APPROVAL,
  ORDER_STATUS_FOR_PAYMENT,
  ORDER_STATUS_FOR_PICKUP,
  ORDER_STATUS_ITEM_RECEIVED,
  ORDER_STATUS_ITEM_RECEIVED_PAID,
  ORDER_STATUS_ITEM_RECEIVED_UNPAID,
  ORDER_STATUS_PAID,
  ORDER_STATUS_RESERVATION,
  ORDER_INSTALLMENT_STATUS_FOR_PAYMENT_VERIFICATION,
  ORDER_INSTALLMENT_STATUS_PAID,
  ORDER_INSTALLMENT_STATUS_UNPAID,
  ORDER_PAYMENT_STATUS_CONFIRMED,
  ORDER_PAYMENT_STATUS_FOR_VERIFICATION,
  ORDER_NUMBER_OFFSET,
  PAYMENT_TYPE_CREDIT_LINE,
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

export type { OrderInstallmentView, OrderPaymentView };

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

function liveInventoryUnitPrice(
  item: InventoryItem | null | undefined,
): number | null {
  if (!item) return null;
  return effectiveInventoryUnitPrice(item);
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
  creditCardPrice: string | null;
  remainingBalancePrice: string | null;
  reservationPaymentProofUrl: string | null;
  reservationPaymentStatus: string | null;
  fullPaymentProofUrl: string | null;
  holdingPeriod: string | null;
  layawayPaymentStartDate: string | null;
  declineReason: string | null;
  convertedToLayawayAt: string | null;
  signatureUrl: string | null;
  pickupOption: string | null;
  pickupBranch: string | null;
  courierService: string | null;
  createdAt: string;
  updatedAt: string;
  inventoryItem: {
    id: string;
    sku: string;
    itemLabel: string;
  };
  installments: OrderInstallmentView[];
  payments: OrderPaymentView[];
  orderTotalPrice: string | null;
  vipPrice: string | null;
  vipTier: VipDiscountTier | null;
};

export type DailySalesByPriceTierDashboard = {
  year: number;
  month: number;
  days: DailySalesByTierRow[];
  yAxisMax: number;
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
  assignedToEmployeeId: string | null;
  assignedToName: string | null;
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
  creditCardPrice: string | null;
  remainingBalancePrice: string | null;
  reservationPaymentProofUrl: string | null;
  reservationPaymentStatus: string | null;
  fullPaymentProofUrl: string | null;
  shippingFeeCareOf: string | null;
  shippingFeeProofUrl: string | null;
  pickupOption: string | null;
  pickupBranch: string | null;
  courierService: string | null;
  holdingPeriod: string | null;
  layawayPaymentStartDate: string | null;
  consignorPaymentRelease: number | null;
  convertedToLayawayAt: string | null;
  declineReason: string | null;
  signatureUrl: string | null;
  assignedToEmployeeId: string | null;
  assignedToName: string | null;
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
  payments: OrderPaymentView[];
  orderTotalPrice: string | null;
  vipPrice: string | null;
  vipTier: VipDiscountTier | null;
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

function formatEmployeeName(employee: Employee | null | undefined): string | null {
  if (!employee) return null;
  const name = [employee.firstName, employee.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  return name.length > 0 ? name : null;
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
    @InjectRepository(OrderPayment)
    private readonly orderPaymentsRepo: Repository<OrderPayment>,
    @InjectRepository(Waitlist)
    private readonly waitlistsRepo: Repository<Waitlist>,
    @InjectRepository(Client)
    private readonly clientsRepo: Repository<Client>,
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
    @InjectRepository(InventoryItem)
    private readonly inventoryRepo: Repository<InventoryItem>,
    @InjectRepository(ItemAuthentication)
    private readonly itemAuthRepo: Repository<ItemAuthentication>,
    private readonly dataSource: DataSource,
    private readonly media: MediaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly consignorPaymentsService: ConsignorPaymentsService,
    private readonly clientActivityTotals: ClientActivityTotalsService,
    private readonly vipPricing: VipPricingService,
    private readonly notifications: NotificationsService,
    private readonly tasks: TasksService,
    private readonly paymentVerification: PaymentVerificationNotifyService,
    private readonly featureAccess: FeatureAccessService,
    private readonly orderAudit: OrderAuditService,
    private readonly inventoryAudit: InventoryAuditService,
  ) {}

  private async employeeForUser(userId: string): Promise<Employee | null> {
    return this.employeesRepo.findOne({ where: { userId } });
  }

  private async auditActor(user: JwtUser): Promise<OrderAuditActor> {
    if (user.userType === UserType.CLIENT) {
      return this.orderAudit.customerActor(user.userId);
    }
    return {
      userId: user.userId,
      label: await this.orderAudit.staffActorLabel(user.userId),
    };
  }

  private async sellingPriceForClient(
    item: InventoryItem,
    client: Pick<Client, 'vipStatus'>,
  ): Promise<number | null> {
    const base = liveInventoryUnitPrice(item);
    if (base == null) return null;
    const settings = await this.vipPricing.loadSettings();
    return (
      this.vipPricing.priceForClient(
        base,
        Boolean(item.enableDiscount),
        client.vipStatus,
        settings,
      ) ?? base
    );
  }

  private async vipFieldsForCustomer(
    item: InventoryItem,
    client: Pick<Client, 'vipStatus'>,
  ): Promise<{ vipPrice: string | null; vipTier: VipDiscountTier | null }> {
    const settings = await this.vipPricing.loadSettings();
    const vipPrice = this.vipPricing.priceStringForClient(
      liveInventoryUnitPrice(item),
      Boolean(item.enableDiscount),
      client.vipStatus,
      settings,
    );
    const vipTier = vipPrice
      ? this.vipPricing.appliedTier(
          Boolean(item.enableDiscount),
          client.vipStatus,
        )
      : null;
    return { vipPrice, vipTier };
  }

  private async auditActorFromUserId(userId: string): Promise<OrderAuditActor> {
    const emp = await this.employeeForUser(userId);
    if (emp) {
      return { userId, label: formatEmployeeName(emp) ?? 'Staff' };
    }
    return this.orderAudit.customerActor(userId);
  }

  private canBypassOrderAssignment(
    user: JwtUser,
    employee: Employee | null,
  ): boolean {
    if (user.isAdmin) return true;
    return employee != null && isSalesAdminPosition(employee.position);
  }

  private async enforceOrderMutationAccessOnOrder(
    user: JwtUser,
    order: Pick<Order, 'assignedToId'>,
  ): Promise<void> {
    const employee = await this.employeeForUser(user.userId);
    if (this.canBypassOrderAssignment(user, employee)) {
      return;
    }
    const assigneeId = order.assignedToId;
    if (!assigneeId) {
      throw new ForbiddenException(
        'This order must be assigned to a sales associate before it can be updated.',
      );
    }
    if (!employee?.id || employee.id !== assigneeId) {
      throw new ForbiddenException(
        'Only the assigned sales associate can perform this action.',
      );
    }
  }

  private async requireGeneralManager(user: JwtUser): Promise<Employee> {
    const employee = await this.employeeForUser(user.userId);
    if (!employee || !isGeneralManagerPosition(employee.position)) {
      throw new ForbiddenException(
        'Only the General Manager can perform this action.',
      );
    }
    return employee;
  }

  private async findGeneralManager(): Promise<Employee | null> {
    return this.employeesRepo
      .createQueryBuilder('e')
      .where('LOWER(TRIM(e.position)) = :pos', {
        pos: GENERAL_MANAGER_POSITION.toLowerCase(),
      })
      .getOne();
  }

  private assertInstallmentNotPendingPenaltyWaive(
    row: Pick<OrderInstallment, 'penaltyWaiveStatus' | 'installmentNumber'>,
  ): void {
    if (isPenaltyWaivePending(row.penaltyWaiveStatus)) {
      throw new BadRequestException(
        `Installment ${row.installmentNumber} has a penalty waive pending approval. Wait for the General Manager to approve or reject it before recording payment.`,
      );
    }
  }

  private async notifyAssignedSalesAssociate(
    order: Pick<Order, 'assignedToId'>,
    message: string,
    orderId: string,
  ): Promise<void> {
    const assigneeId = order.assignedToId?.trim();
    if (!assigneeId) {
      return;
    }
    await this.notifications.notify({
      message,
      receiverId: assigneeId,
      orderId,
    });
  }

  private async notifyPaymentVerificationNeeded(input: {
    order: Pick<Order, 'id' | 'orderNumber'>;
    kind?: 'payment' | 'reservation';
  }): Promise<void> {
    const orderId = input.order.id;
    const orderNumber = input.order.orderNumber;
    const isReservation = input.kind === 'reservation';
    await this.paymentVerification.notifyVerifiers({
      title: isReservation
        ? `Verify reservation payment for Order #${orderNumber}`
        : `Verify payment for Order #${orderNumber}`,
      message: isReservation
        ? `A reservation fee proof for Order #${orderNumber} is awaiting verification.`
        : `A proof of payment for Order #${orderNumber} is awaiting verification.`,
      portalPath: `/portal/orders/${orderId}`,
      orderId,
    });
  }

  private async enforceOrderMutationAccess(
    user: JwtUser,
    orderId: string,
  ): Promise<Order> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    await this.enforceOrderMutationAccessOnOrder(user, order);
    return order;
  }

  /** Sales associates only (admins may create and are auto-assigned when they have a profile). */
  private async resolveStaffOrderCreatorAssignment(
    user: JwtUser,
  ): Promise<string | null> {
    const employee = await this.employeeForUser(user.userId);
    if (user.isAdmin) {
      return employee?.id ?? null;
    }
    if (!employee || !isSalesAssociatePosition(employee.position)) {
      throw new ForbiddenException('Only sales associates can create orders.');
    }
    return employee.id;
  }

  async listSalesAssociates(): Promise<{ id: string; displayName: string }[]> {
    const rows = await this.employeesRepo
      .createQueryBuilder('e')
      .where('LOWER(TRIM(e.position)) = :p', { p: 'sales associate' })
      .orderBy('e.lastName', 'ASC')
      .addOrderBy('e.firstName', 'ASC')
      .getMany();
    return rows.map((e) => ({
      id: e.id,
      displayName: formatEmployeeName(e) ?? e.email,
    }));
  }

  async batchAssignSalesAssociate(
    dto: BatchAssignSalesAssociateDto,
    actor: JwtUser,
  ): Promise<{ updated: number }> {
    const actorEmployee = await this.employeeForUser(actor.userId);
    if (!canAssignWorkToOthers(actor.isAdmin, actorEmployee?.position)) {
      if (!actorEmployee?.id) {
        throw new ForbiddenException(
          'Your account is not linked to an employee record.',
        );
      }
      if (actorEmployee.id !== dto.employeeId) {
        throw new ForbiddenException(
          'Only a supervisor can assign orders to other staff.',
        );
      }
    }
    const employee = await this.employeesRepo.findOne({
      where: { id: dto.employeeId },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    if (!isSalesAssociatePosition(employee.position)) {
      throw new BadRequestException(
        actorEmployee?.id === dto.employeeId
          ? 'You must be in the Sales Associate position to assign orders to yourself.'
          : 'Selected person is not in the Sales Associate position.',
      );
    }

    const uniqueIds = [...new Set(dto.orderIds)];
    const assignedOrders: {
      orderId: string;
      orderNumber: number;
      createTask: boolean;
    }[] = [];
    const supervisorAssignment = canAssignWorkToOthers(
      actor.isAdmin,
      actorEmployee?.position,
    );
    const auditActor = await this.auditActor(actor);

    await this.ordersRepo.manager.transaction(async (em) => {
      for (const orderId of uniqueIds) {
        const order = await em.findOne(Order, { where: { id: orderId } });
        if (!order) {
          throw new NotFoundException(`Order ${orderId} not found`);
        }
        if (!isOrderOpenForStaffUpdates(order.status)) {
          throw new BadRequestException(
            `Order #${order.orderNumber} is closed and cannot be assigned.`,
          );
        }
        const alreadyAssigned = order.assignedToId === dto.employeeId;
        const before = cloneOrderForAudit(order);
        order.assignedToId = dto.employeeId;
        order.updatedById = actor.userId;
        await em.save(order);
        await this.orderAudit.recordDiff(
          order.id,
          before,
          order,
          auditActor,
          em,
        );
        assignedOrders.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          createTask: supervisorAssignment && !alreadyAssigned,
        });
      }
    });

    for (const { orderId, orderNumber, createTask } of assignedOrders) {
      void this.notifications
        .notify({
          message: `Order #${orderNumber} has been assigned to you.`,
          receiverId: dto.employeeId,
        })
        .catch((err: unknown) => {
          this.logger.error(
            'Failed to notify sales associate for order assignment',
            err,
          );
        });
      if (!createTask) continue;
      void this.tasks
        .createAssigned({
          assigneeId: dto.employeeId,
          title: `Order #${orderNumber} is assigned to you`,
          description: portalPageUrl(this.config, `/portal/orders/${orderId}`),
          severity: 'moderate',
          dueDate: null,
        })
        .catch((err: unknown) => {
          this.logger.error(
            'Failed to create task for sales associate order assignment',
            err,
          );
        });
    }

    return { updated: uniqueIds.length };
  }

  private async getInstallmentViewsForOrder(
    order: Order,
  ): Promise<OrderInstallmentView[]> {
    if (!shouldIncludeInstallmentSchedule(order)) {
      return [];
    }
    await this.ensureInstallments(order);
    await this.backfillInstallmentDueDates(order);
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

  private async getPaymentViewsForOrder(
    order: Order,
  ): Promise<OrderPaymentView[]> {
    const rows = await this.orderPaymentsRepo.find({
      where: { orderId: order.id },
      order: { proofUploadedAt: 'ASC' },
    });
    if (!shouldLoadOrderPaymentViews(order, rows.length)) {
      return [];
    }
    const proofUrlByPaymentId = new Map<string, string | null>();
    for (const row of rows) {
      proofUrlByPaymentId.set(
        row.id,
        await this.media.findFirstUrl(
          MediaOwnerType.ORDER_PAYMENT,
          row.id,
          MediaPurpose.PAYMENT_PROOF,
        ),
      );
    }
    return buildOrderPaymentViews(
      rows,
      (row) => proofUrlByPaymentId.get(row.id) ?? null,
    );
  }

  private async loadOrderPayments(orderId: string): Promise<OrderPayment[]> {
    return this.orderPaymentsRepo.find({
      where: { orderId },
      order: { proofUploadedAt: 'ASC' },
    });
  }

  private orderCreditCardPrice(order: Order): string | null {
    const item = order.inventoryItem;
    if (!item) return null;
    if (order.status === ORDER_STATUS_RESERVATION) {
      return this.inventoryCreditCardPrice(item);
    }
    if (
      order.paymentType === PAYMENT_TYPE_FULL &&
      order.fullPaymentPrice != null
    ) {
      const best = parseMoney(order.fullPaymentPrice);
      if (best != null) {
        return formatMoney(Math.round(best * 104) / 100);
      }
    }
    return this.inventoryCreditCardPrice(item);
  }

  private inventoryCreditCardPrice(item: InventoryItem): string | null {
    if (
      item.creditCardPrice != null &&
      String(item.creditCardPrice).trim() !== ''
    ) {
      return String(item.creditCardPrice).trim();
    }
    return computeCreditCardPriceFromTbh(item.tbhSellingPrice);
  }

  private orderTotalPriceValue(order: Order): string | null {
    if (order.orderTotalPrice != null) {
      return order.orderTotalPrice;
    }
    const itemPrice = liveInventoryUnitPrice(order.inventoryItem);
    if (order.status === ORDER_STATUS_RESERVATION) {
      return itemPrice == null ? null : formatMoney(itemPrice);
    }
    return order.fullPaymentPrice;
  }

  /** Cash/item price before layaway interest. Falls back to live inventory price. */
  private originalItemPriceValue(order: Order): string | null {
    if (
      order.fullPaymentPrice != null &&
      String(order.fullPaymentPrice).trim() !== ''
    ) {
      return order.fullPaymentPrice;
    }
    const itemPrice = liveInventoryUnitPrice(order.inventoryItem);
    return itemPrice == null ? null : formatMoney(itemPrice);
  }

  private remainingBalanceForOrder(
    order: Order,
    payments: OrderPayment[],
  ): string | null {
    if (!shouldIncludeOrderPayments(order)) {
      return null;
    }
    const itemPrice = liveInventoryUnitPrice(order.inventoryItem);
    return computeOrderPaymentRemainingBalance(order, payments, itemPrice);
  }

  private assertOrderPaymentsAccessible(order: Order): void {
    if (!shouldIncludeOrderPayments(order)) {
      throw new BadRequestException(
        'Payments are not available for this order',
      );
    }
    if (
      order.status !== ORDER_STATUS_FOR_PAYMENT &&
      order.status !== ORDER_STATUS_RESERVATION
    ) {
      throw new BadRequestException(
        'Payments can only be added while the order is for payment or reservation',
      );
    }
  }

  private async hasLegacyFullPaymentProof(order: Order): Promise<boolean> {
    return this.media.hasMedia(
      MediaOwnerType.ORDER,
      order.id,
      MediaPurpose.PAYMENT_PROOF,
      { proofType: 'full' },
    );
  }

  private async hasConfirmedOrderPayment(orderId: string): Promise<boolean> {
    const count = await this.orderPaymentsRepo.count({
      where: { orderId, status: ORDER_PAYMENT_STATUS_CONFIRMED },
    });
    return count > 0;
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
        dueDate: computeDefaultDueDate(
          formatOrderDate(order.layawayPaymentStartDate),
          index + 1,
        ),
        proofUploadedAt: null,
        proofUploadedByUserId: null,
        createdById: userId ?? order.updatedById,
        updatedById: userId ?? order.updatedById,
      }),
    );
    await this.installmentsRepo.save(rows);
  }

  private async backfillInstallmentDueDates(
    order: Order,
    userId?: string,
  ): Promise<void> {
    const paymentStartDate = formatOrderDate(order.layawayPaymentStartDate);
    if (!paymentStartDate) {
      return;
    }

    const rows = await this.installmentsRepo.find({
      where: { orderId: order.id },
    });
    const toUpdate = rows.filter(
      (row) => row.dueDate == null || String(row.dueDate).trim() === '',
    );
    if (toUpdate.length === 0) {
      return;
    }

    for (const row of toUpdate) {
      row.dueDate = computeDefaultDueDate(
        paymentStartDate,
        row.installmentNumber,
      );
      row.updatedById = userId ?? order.updatedById;
    }
    await this.installmentsRepo.save(toUpdate);
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
    const actor = await this.auditActorFromUserId(userId);

    for (let i = 0; i < scheduledAmounts.length; i++) {
      const row = em.create(OrderInstallment, {
        orderId: order.id,
        installmentNumber: i + 1,
        scheduledAmount: scheduledAmounts[i],
        amountPaid: null,
        dueDate: computeDefaultDueDate(
          formatOrderDate(order.layawayPaymentStartDate),
          i + 1,
        ),
        proofUploadedAt: null,
        proofUploadedByUserId: null,
        createdById: userId,
        updatedById: userId,
      });
      await em.save(row);
      await this.orderAudit.recordInstallmentDiff(order.id, row, null, actor, em);
    }
  }

  private latestConfirmedPaymentDate(payments: OrderPayment[]): string {
    let latest: string | null = null;
    for (const row of payments) {
      if (row.status?.trim() !== ORDER_PAYMENT_STATUS_CONFIRMED) continue;
      const date = formatOrderDate(row.paymentDate);
      if (date != null && (latest == null || date > latest)) {
        latest = date;
      }
    }
    return latest ?? todayDateString();
  }

  private async recordConsignorPaymentReleaseForLayaway(
    em: typeof this.ordersRepo.manager,
    order: Order,
    item: InventoryItem,
    markedPaidAt: Date,
  ): Promise<void> {
    if (order.paymentType !== PAYMENT_TYPE_LAYAWAY) return;
    if (item.inquiryId && item.transactionType === 'consignment') {
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

  private async applyPreConversionPaymentCredit(
    em: typeof this.ordersRepo.manager,
    order: Order,
    userId: string,
  ): Promise<void> {
    if (order.convertedToLayawayAt == null) {
      return;
    }

    const paymentRows = await em.find(OrderPayment, {
      where: { orderId: order.id },
      order: { proofUploadedAt: 'ASC' },
    });
    const credit = computeFullPaymentCredit(order, paymentRows);
    if (credit <= 0) {
      return;
    }

    const installments = await em.find(OrderInstallment, {
      where: { orderId: order.id },
      order: { installmentNumber: 'ASC' },
    });
    if (installments.length === 0) {
      return;
    }

    const item = await em.findOne(InventoryItem, {
      where: { id: order.inventoryItemId },
      relations: { inquiry: true },
    });
    if (!item) {
      return;
    }

    const paymentDate = this.latestConfirmedPaymentDate(paymentRows);
    const markedPaidAt = new Date();
    const actor = await this.auditActorFromUserId(userId);
    const beforeInstallments = installments.map(cloneInstallmentForAudit);
    const beforeOrder = cloneOrderForAudit(order);
    const { fullyPaidInstallmentNumbers } = applyPaymentCreditToInstallments(
      installments,
      credit,
      paymentDate,
      markedPaidAt,
    );

    for (let i = 0; i < installments.length; i++) {
      const row = installments[i];
      row.updatedById = userId;
      await em.save(row);
      await this.orderAudit.recordInstallmentDiff(
        order.id,
        row,
        beforeInstallments[i],
        actor,
        em,
      );
    }

    for (const installmentNumber of fullyPaidInstallmentNumbers) {
      if (
        order.consignorPaymentRelease != null &&
        installmentNumber === order.consignorPaymentRelease
      ) {
        await this.recordConsignorPaymentReleaseForLayaway(
          em,
          order,
          item,
          markedPaidAt,
        );
      }
      if (
        order.layawayMonths != null &&
        installmentNumber === order.layawayMonths
      ) {
        order.status = ORDER_STATUS_PAID;
        order.updatedById = userId;
        await em.save(order);
        await this.orderAudit.recordDiff(
          order.id,
          beforeOrder,
          order,
          actor,
          em,
        );
      }
    }
  }

  private async areAllInstallmentsPaid(
    orderId: string,
    em: typeof this.ordersRepo.manager,
  ): Promise<boolean> {
    const rows = await em.find(OrderInstallment, {
      where: { orderId },
      order: { installmentNumber: 'ASC' },
    });
    if (rows.length === 0) {
      return false;
    }
    return rows.every((row) => isInstallmentPaidStatus(row.status));
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
    const before = cloneOrderForAudit(order);

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
        order.reservationPaymentProofUploadedAt =
          order.fullPaymentProofUploadedAt;
        order.reservationPaymentProofUploadedByUserId =
          order.fullPaymentProofUploadedByUserId;
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

    const uploadedAt = new Date();
    await this.ordersRepo.update(order.id, {
      fullPaymentProofUploadedAt: uploadedAt,
      fullPaymentProofUploadedByUserId: user.userId,
      updatedById: user.userId,
    });
    order.fullPaymentProofUploadedAt = uploadedAt;
    order.fullPaymentProofUploadedByUserId = user.userId;
    await this.orderAudit.recordDiff(
      order.id,
      before,
      order,
      await this.auditActor(user),
    );
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

    const before = cloneOrderForAudit(order);
    const uploadedAt = new Date();
    const previousStatus = order.reservationPaymentStatus;
    await this.ordersRepo.update(order.id, {
      reservationPaymentProofUploadedAt: uploadedAt,
      reservationPaymentProofUploadedByUserId: user.userId,
      reservationPaymentStatus: PAYMENT_STATUS_FOR_VERIFICATION,
      updatedById: user.userId,
    });
    order.reservationPaymentProofUploadedAt = uploadedAt;
    order.reservationPaymentProofUploadedByUserId = user.userId;
    order.reservationPaymentStatus = PAYMENT_STATUS_FOR_VERIFICATION;
    await this.orderAudit.recordDiff(
      order.id,
      before,
      order,
      await this.auditActor(user),
    );
    if (!isPaymentAwaitingVerification(previousStatus)) {
      await this.notifyPaymentVerificationNeeded({
        order,
        kind: 'reservation',
      });
    }
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
    return this.orderTotalPriceValue(order);
  }

  private remainingBalancePrice(
    order: Order,
    payments: OrderPayment[],
  ): string | null {
    return this.remainingBalanceForOrder(order, payments);
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
      amount: isInstallmentPaymentType(order.paymentType)
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
        price:
          liveInventoryUnitPrice(row.inventoryItem) != null
            ? formatDecimal(liveInventoryUnitPrice(row.inventoryItem)!)
            : row.inventoryItem.tbhSellingPrice,
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
    const payments = await this.getPaymentViewsForOrder(order);
    const paymentRows = await this.loadOrderPayments(order.id);
    const vip = await this.vipFieldsForCustomer(order.inventoryItem, client);

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentType: order.paymentType,
      layawayMonths: order.layawayMonths,
      layawayPrice: order.layawayPrice,
      layawayMonthlyPayment: order.layawayMonthlyPayment,
      fullPaymentPrice: isInstallmentPaymentType(order.paymentType)
        ? this.originalItemPriceValue(order)
        : order.fullPaymentPrice,
      fullPaymentTotalPrice: this.fullPaymentTotalPrice(order),
      creditCardPrice: this.orderCreditCardPrice(order),
      remainingBalancePrice: this.remainingBalancePrice(order, paymentRows),
      orderTotalPrice: this.orderTotalPriceValue(order),
      vipPrice: vip.vipPrice,
      vipTier: vip.vipTier,
      reservationPaymentProofUrl: await this.reservationPaymentProofUrl(order),
      reservationPaymentStatus: order.reservationPaymentStatus ?? null,
      fullPaymentProofUrl: await this.fullPaymentProofUrl(order),
      holdingPeriod: order.holdingPeriod?.toISOString() ?? null,
      layawayPaymentStartDate: formatOrderDate(order.layawayPaymentStartDate),
      declineReason: order.declineReason,
      convertedToLayawayAt: order.convertedToLayawayAt?.toISOString() ?? null,
      signatureUrl: await this.signatureUrlForOrder(order.id),
      pickupOption: order.pickupOption,
      pickupBranch: order.pickupBranch,
      courierService: order.courierService,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      inventoryItem: {
        id: order.inventoryItem.id,
        sku: order.inventoryItem.sku,
        itemLabel: itemLabelFromSnapshot(order.inventoryItem),
      },
      installments,
      payments,
    };
  }

  async getDailySalesByPriceTierForStaff(
    year: number,
    month: number,
  ): Promise<DailySalesByPriceTierDashboard> {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('Invalid year');
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('Invalid month');
    }

    const rows = await this.ordersRepo.find({
      relations: { inventoryItem: true },
    });

    const buckets = new Map<string, DailySalesByTierRow>();
    let maxBarValue = 0;

    for (const order of rows) {
      if (!isSoldOrderStatus(order.status)) continue;

      const item = order.inventoryItem;
      const soldAt = item.dateSold ?? order.updatedAt;
      const soldDateOnly = calendarDateStringInTimeZone(soldAt);
      const [y, m, dayPart] = soldDateOnly.split('-');
      if (Number(y) !== year || Number(m) !== month) continue;

      const unitPrice = effectiveInventoryUnitPrice(item);
      const tierKey =
        unitPrice != null ? salesPriceTierKey(unitPrice) : null;
      if (!tierKey) continue;

      const amountRaw = isInstallmentPaymentType(order.paymentType)
        ? order.layawayPrice
        : order.fullPaymentPrice;
      const amount = parseMoney(amountRaw);
      if (amount == null || amount <= 0) continue;

      const dayLabel = String(Number(dayPart));
      let row = buckets.get(dayLabel);
      if (!row) {
        row = emptyDailySalesByTierRow(dayLabel);
        buckets.set(dayLabel, row);
      }
      row[tierKey] += amount;
      maxBarValue = Math.max(maxBarValue, row[tierKey]);
    }

    const days = [...buckets.values()].sort(
      (a, b) => Number(a.day) - Number(b.day),
    );

    return {
      year,
      month,
      days,
      yAxisMax: suggestDailySalesYAxisMax(maxBarValue),
    };
  }

  async findAllForStaff(): Promise<StaffOrderRow[]> {
    const rows = await this.ordersRepo.find({
      relations: { customer: true, inventoryItem: true, assignedTo: true },
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
      amount: isInstallmentPaymentType(order.paymentType)
          ? order.layawayPrice
          : order.fullPaymentPrice,
      layawayMonths: order.layawayMonths,
      holdingPeriod: order.holdingPeriod?.toISOString() ?? null,
      assignedToEmployeeId: order.assignedToId ?? null,
      assignedToName: formatEmployeeName(order.assignedTo),
      createdAt: order.createdAt.toISOString(),
    }));
  }

  async findOneForStaff(id: string): Promise<StaffOrderDetail> {
    const order = await this.ordersRepo.findOne({
      where: { id },
      relations: { customer: true, inventoryItem: true, assignedTo: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const installments = await this.getInstallmentViewsForOrder(order);
    const payments = await this.getPaymentViewsForOrder(order);
    const paymentRows = await this.loadOrderPayments(order.id);
    const vip = await this.vipFieldsForCustomer(
      order.inventoryItem,
      order.customer,
    );

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentType: order.paymentType,
      layawayMonths: order.layawayMonths,
      layawayPrice: order.layawayPrice,
      layawayMonthlyPayment: order.layawayMonthlyPayment,
      fullPaymentPrice: isInstallmentPaymentType(order.paymentType)
        ? this.originalItemPriceValue(order)
        : order.fullPaymentPrice,
      fullPaymentTotalPrice: this.fullPaymentTotalPrice(order),
      creditCardPrice: this.orderCreditCardPrice(order),
      remainingBalancePrice: this.remainingBalancePrice(order, paymentRows),
      orderTotalPrice: this.orderTotalPriceValue(order),
      vipPrice: vip.vipPrice,
      vipTier: vip.vipTier,
      reservationPaymentProofUrl: await this.reservationPaymentProofUrl(order),
      reservationPaymentStatus: order.reservationPaymentStatus ?? null,
      fullPaymentProofUrl: await this.fullPaymentProofUrl(order),
      shippingFeeCareOf: order.shippingFeeCareOf,
      shippingFeeProofUrl: await this.shippingFeeProofUrl(order),
      pickupOption: order.pickupOption,
      pickupBranch: order.pickupBranch,
      courierService: order.courierService,
      holdingPeriod: order.holdingPeriod?.toISOString() ?? null,
      layawayPaymentStartDate: formatOrderDate(order.layawayPaymentStartDate),
      consignorPaymentRelease: order.consignorPaymentRelease,
      convertedToLayawayAt: order.convertedToLayawayAt?.toISOString() ?? null,
      declineReason: order.declineReason,
      signatureUrl: await this.signatureUrlForOrder(order.id),
      assignedToEmployeeId: order.assignedToId ?? null,
      assignedToName: formatEmployeeName(order.assignedTo),
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
      payments,
    };
  }

  async approveLayawayForStaff(
    user: JwtUser,
    id: string,
    dto: ApproveLayawayOrderDto,
  ): Promise<StaffOrderDetail> {
    await this.enforceOrderMutationAccess(user, id);
    await this.dataSource.transaction(async (em) => {
      const order = await em.findOne(Order, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        throw new NotFoundException('Order not found');
      }
      if (!isInstallmentApprovalStatus(order.status)) {
        throw new BadRequestException(
          'Only orders awaiting approval can be approved',
        );
      }
      if (!isInstallmentPaymentType(order.paymentType)) {
        throw new BadRequestException(
          'Order is not a layaway or credit line order',
        );
      }

      const before = cloneOrderForAudit(order);
      const isCreditLine = isCreditLinePaymentType(order.paymentType);
      if (!isCreditLine) {
        if (dto.consignorPaymentRelease == null) {
          throw new BadRequestException(
            'Consignor payment release is required for layaway orders',
          );
        }
        assertConsignorPaymentReleaseWithinTerms(
          dto.consignorPaymentRelease,
          order.layawayMonths,
        );
        order.consignorPaymentRelease = dto.consignorPaymentRelease;
      } else {
        order.consignorPaymentRelease = null;
      }

      const item = await em.findOne(InventoryItem, {
        where: { id: order.inventoryItemId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) {
        throw new NotFoundException('Inventory item not found');
      }

      const beforeItem = cloneInventoryItemForAudit(item);
      order.layawayPaymentStartDate = todayDateString();
      order.updatedById = user.userId;
      if (isCreditLine) {
        order.status = ORDER_STATUS_FOR_PICKUP;
        item.status = INVENTORY_STATUS_FOR_PICKUP;
      } else {
        order.status = ORDER_STATUS_FOR_PAYMENT;
        item.status = INVENTORY_STATUS_RESERVED_LAYAWAY;
      }
      await em.save(order);
      await this.orderAudit.recordDiff(
        order.id,
        before,
        order,
        await this.auditActor(user),
        em,
      );

      item.updatedById = user.userId;
      await em.save(item);
      await this.inventoryAudit.recordDiff(
        item.id,
        beforeItem,
        item,
        await this.auditActor(user),
        em,
      );

      await this.createInstallmentsForOrder(order, em, user.userId);
      await this.applyPreConversionPaymentCredit(em, order, user.userId);
    });

    return this.findOneForStaff(id);
  }

  async declineLayawayForStaff(
    user: JwtUser,
    id: string,
    dto: DeclineLayawayOrderDto,
  ): Promise<StaffOrderDetail> {
    await this.enforceOrderMutationAccess(user, id);
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
      if (!isInstallmentApprovalStatus(order.status)) {
        throw new BadRequestException(
          'Only orders awaiting approval can be declined',
        );
      }
      const before = cloneOrderForAudit(order);
      if (!isInstallmentPaymentType(order.paymentType)) {
        throw new BadRequestException(
          'Order is not a layaway or credit line order',
        );
      }

      const item = await em.findOne(InventoryItem, {
        where: { id: order.inventoryItemId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) {
        throw new NotFoundException('Inventory item not found');
      }

      if (item.status === INVENTORY_STATUS_ON_HOLD) {
        const beforeItem = cloneInventoryItemForAudit(item);
        item.status = INVENTORY_STATUS_AVAILABLE_FOR_PURCHASE;
        item.updatedById = user.userId;
        await em.save(item);
        await this.inventoryAudit.recordDiff(
          item.id,
          beforeItem,
          item,
          await this.auditActor(user),
          em,
        );
      }

      order.status = ORDER_STATUS_DECLINED;
      order.declineReason = reason;
      order.holdingPeriod = null;
      order.updatedById = user.userId;
      await em.save(order);
      await this.orderAudit.recordDiff(
        order.id,
        before,
        order,
        await this.auditActor(user),
        em,
      );
    });

    return this.findOneForStaff(id);
  }

  async updateLayawayTermsForStaff(
    user: JwtUser,
    id: string,
    dto: UpdateLayawayTermsDto,
  ): Promise<StaffOrderDetail> {
    await this.enforceOrderMutationAccess(user, id);
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
      if (!isInstallmentApprovalStatus(order.status)) {
        throw new BadRequestException(
          'Only orders awaiting approval can have terms updated',
        );
      }
      if (!isInstallmentPaymentType(order.paymentType)) {
        throw new BadRequestException(
          'Order is not a layaway or credit line order',
        );
      }

      const before = cloneOrderForAudit(order);
      const isCreditLine = isCreditLinePaymentType(order.paymentType);
      if (!isCreditLine) {
        if (dto.consignorPaymentRelease == null) {
          throw new BadRequestException(
            'Consignor payment release is required for layaway orders',
          );
        }
        assertConsignorPaymentReleaseWithinTerms(
          dto.consignorPaymentRelease,
          dto.layawayMonths,
        );
        order.consignorPaymentRelease = dto.consignorPaymentRelease;
      } else {
        order.consignorPaymentRelease = null;
      }

      order.layawayMonths = dto.layawayMonths;
      order.layawayPrice = formatMoney(layawayPrice);
      order.layawayMonthlyPayment = formatMoney(
        layawayPrice / dto.layawayMonths,
      );
      order.layawayPaymentStartDate = todayDateString();
      order.updatedById = user.userId;
      if (isCreditLine) {
        order.status = ORDER_STATUS_FOR_PICKUP;
      } else {
        order.status = ORDER_STATUS_FOR_PAYMENT;
      }
      await em.save(order);
      await this.orderAudit.recordDiff(
        order.id,
        before,
        order,
        await this.auditActor(user),
        em,
      );

      const item = await em.findOne(InventoryItem, {
        where: { id: order.inventoryItemId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) {
        throw new NotFoundException('Inventory item not found');
      }

      const beforeItem = cloneInventoryItemForAudit(item);
      item.status = isCreditLine
        ? INVENTORY_STATUS_FOR_PICKUP
        : INVENTORY_STATUS_RESERVED_LAYAWAY;
      item.updatedById = user.userId;
      await em.save(item);
      await this.inventoryAudit.recordDiff(
        item.id,
        beforeItem,
        item,
        await this.auditActor(user),
        em,
      );

      await this.createInstallmentsForOrder(order, em, user.userId);
      await this.applyPreConversionPaymentCredit(em, order, user.userId);
    });

    return this.findOneForStaff(id);
  }

  async convertToLayawayForStaff(
    user: JwtUser,
    id: string,
    dto: ConvertToLayawayDto,
  ): Promise<StaffOrderDetail> {
    await this.enforceOrderMutationAccess(user, id);
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
      if (order.paymentType !== PAYMENT_TYPE_FULL) {
        throw new BadRequestException(
          'Only full payment orders can be converted to layaway',
        );
      }
      if (order.convertedToLayawayAt != null) {
        throw new BadRequestException('Order has already been converted to layaway');
      }
      if (
        order.status !== ORDER_STATUS_FOR_PAYMENT &&
        order.status !== ORDER_STATUS_RESERVATION
      ) {
        throw new BadRequestException(
          'Only orders for payment or reservation can be converted to layaway',
        );
      }

      const item = await em.findOne(InventoryItem, {
        where: { id: order.inventoryItemId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) {
        throw new NotFoundException('Inventory item not found');
      }

      const auth = await em.findOne(ItemAuthentication, {
        where: { inventoryItemId: item.id },
      });
      const layawayEligibility = getLayawayEligibility(
        auth?.rating ?? null,
        categoryFromItemSnapshot(item.itemSnapshot),
      );
      if (!layawayEligibility.allowed) {
        throw new BadRequestException(layawayEligibility.reasons.join(' '));
      }

      assertConsignorPaymentReleaseWithinTerms(
        dto.consignorPaymentRelease,
        dto.layawayMonths,
      );

      const paymentRows = await em.find(OrderPayment, {
        where: { orderId: order.id },
        order: { proofUploadedAt: 'ASC' },
      });
      const credit = computeFullPaymentCredit(order, paymentRows);
      if (credit >= layawayPrice) {
        throw new BadRequestException(
          'Total confirmed payments already cover the layaway price. Mark the order as paid instead of converting to layaway.',
        );
      }

      const before = cloneOrderForAudit(order);
      order.paymentType = PAYMENT_TYPE_LAYAWAY;
      order.layawayMonths = dto.layawayMonths;
      order.layawayPrice = formatMoney(layawayPrice);
      order.layawayMonthlyPayment = formatMoney(
        layawayPrice / dto.layawayMonths,
      );
      order.consignorPaymentRelease = dto.consignorPaymentRelease;
      order.convertedToLayawayAt = new Date();
      order.status = ORDER_STATUS_FOR_LAYAWAY_APPROVAL;
      order.layawayPaymentStartDate = null;
      order.holdingPeriod = addHours(new Date(), LAYAWAY_HOLDING_HOURS);
      order.updatedById = user.userId;
      await em.save(order);
      await this.orderAudit.recordDiff(
        order.id,
        before,
        order,
        await this.auditActor(user),
        em,
      );
    });

    return this.findOneForStaff(id);
  }

  async cancelOrderForStaff(
    user: JwtUser,
    id: string,
    dto: CancelOrderDto,
  ): Promise<StaffOrderDetail> {
    await this.enforceOrderMutationAccess(user, id);
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

      const beforeItem = cloneInventoryItemForAudit(item);
      item.status = INVENTORY_STATUS_AVAILABLE_FOR_PURCHASE;
      item.updatedById = user.userId;
      await em.save(item);
      await this.inventoryAudit.recordDiff(
        item.id,
        beforeItem,
        item,
        await this.auditActor(user),
        em,
      );

      const before = cloneOrderForAudit(order);
      order.status = ORDER_STATUS_CANCELLED;
      order.declineReason = reason;
      order.holdingPeriod = null;
      order.updatedById = user.userId;
      await em.save(order);
      await this.orderAudit.recordDiff(
        order.id,
        before,
        order,
        await this.auditActor(user),
        em,
      );
    });

    return this.findOneForStaff(id);
  }

  async markPaidForStaff(user: JwtUser, id: string): Promise<StaffOrderDetail> {
    const order = await this.ordersRepo.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    await this.featureAccess.assertAccess(
      user.userId,
      user.isAdmin,
      'payment-verification',
      'edit',
    );
    if (order.paymentType === PAYMENT_TYPE_LAYAWAY) {
      throw new BadRequestException(
        'Layaway orders are marked as paid automatically when the last installment is marked as paid',
      );
    }
    if (order.paymentType === PAYMENT_TYPE_CREDIT_LINE) {
      throw new BadRequestException(
        'Credit line orders are marked as paid automatically when the last installment is marked as paid',
      );
    }
    if (order.paymentType !== PAYMENT_TYPE_FULL) {
      throw new BadRequestException('Unsupported payment type');
    }
    if (
      order.status !== ORDER_STATUS_FOR_PAYMENT &&
      order.status !== ORDER_STATUS_RESERVATION
    ) {
      throw new BadRequestException(
        'Only full payment orders awaiting payment or reserved can be marked as paid',
      );
    }
    if (
      !(await this.hasLegacyFullPaymentProof(order)) &&
      !(await this.hasConfirmedOrderPayment(order.id))
    ) {
      throw new BadRequestException(
        'Confirm at least one payment or upload legacy proof before marking this order as paid',
      );
    }

    const before = cloneOrderForAudit(order);
    order.status = ORDER_STATUS_PAID;
    order.updatedById = user.userId;
    await this.ordersRepo.save(order);
    await this.orderAudit.recordDiff(
      order.id,
      before,
      order,
      await this.auditActor(user),
    );

    return this.findOneForStaff(id);
  }

  async markForPickupForStaff(
    user: JwtUser,
    id: string,
    pickupOptionRaw: string | undefined,
    pickupBranchRaw: string | undefined,
    courierServiceRaw: string | undefined,
    shippingFeeCareOfRaw: string | undefined,
    proofFile: MulterFile | undefined,
  ): Promise<StaffOrderDetail> {
    await this.enforceOrderMutationAccess(user, id);
    const { pickupOption, pickupBranch, courierService } =
      resolveOrderPickupFields({
        pickupOptionRaw,
        pickupBranchRaw,
        courierServiceRaw,
      });

    let shippingFeeCareOf: string | null = null;
    if (pickupOption === PICKUP_OPTION_COURIER) {
      shippingFeeCareOf = shippingFeeCareOfRaw?.trim() ?? '';
      if (
        !SHIPPING_FEE_CARE_OF_OPTIONS.includes(
          shippingFeeCareOf as (typeof SHIPPING_FEE_CARE_OF_OPTIONS)[number],
        )
      ) {
        throw new BadRequestException(
          'Shipping fee care of must be The Bag Hub or Client',
        );
      }

      if (shippingFeeCareOf === SHIPPING_FEE_CARE_OF_TBH && proofFile?.buffer?.length) {
        const mime = proofFile.mimetype?.toLowerCase() ?? '';
        if (!ALLOWED_PROOF_MIMES.has(mime)) {
          throw new BadRequestException(
            `Proof must be an image or PDF (${proofFile.mimetype || 'unknown'})`,
          );
        }
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

      const markingPaidAsForPickup = order.status === ORDER_STATUS_PAID;
      const updatingForPickupDetails =
        order.status === ORDER_STATUS_FOR_PICKUP;
      if (!markingPaidAsForPickup && !updatingForPickupDetails) {
        throw new BadRequestException(
          'Only paid orders or orders already for pick-up can update pick-up details',
        );
      }

      const item = await em.findOne(InventoryItem, {
        where: { id: order.inventoryItemId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) {
        throw new NotFoundException('Inventory item not found');
      }

      const before = cloneOrderForAudit(order);
      if (pickupOption === PICKUP_OPTION_COURIER) {
        if (shippingFeeCareOf === SHIPPING_FEE_CARE_OF_TBH) {
          if (proofFile?.buffer?.length) {
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
          } else if (!order.shippingFeeProofUploadedAt) {
            throw new BadRequestException(
              'Proof of payment for shipping fee is required when The Bag Hub covers shipping',
            );
          }
        } else {
          order.shippingFeeProofUploadedAt = null;
          order.shippingFeeProofUploadedByUserId = null;
        }
        order.shippingFeeCareOf = shippingFeeCareOf;
      } else {
        order.shippingFeeCareOf = null;
        order.shippingFeeProofUploadedAt = null;
        order.shippingFeeProofUploadedByUserId = null;
      }

      order.pickupOption = pickupOption;
      order.pickupBranch = pickupBranch;
      order.courierService = courierService;
      order.updatedById = user.userId;

      if (markingPaidAsForPickup) {
        const beforeItem = cloneInventoryItemForAudit(item);
        item.status = INVENTORY_STATUS_FOR_PICKUP;
        item.updatedById = user.userId;
        await em.save(item);
        await this.inventoryAudit.recordDiff(
          item.id,
          beforeItem,
          item,
          await this.auditActor(user),
          em,
        );

        order.status = ORDER_STATUS_FOR_PICKUP;
        await em.save(order);
        await this.orderAudit.recordDiff(
          order.id,
          before,
          order,
          await this.auditActor(user),
          em,
        );

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
      } else {
        await em.save(order);
        await this.orderAudit.recordDiff(
          order.id,
          before,
          order,
          await this.auditActor(user),
          em,
        );
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
    await this.enforceOrderMutationAccess(user, orderId);
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
      if (isCreditLinePaymentType(order.paymentType) && customerId != null) {
        throw new BadRequestException(
          'Credit line orders can only be marked as item received by staff',
        );
      }
      if (order.status !== ORDER_STATUS_FOR_PICKUP) {
        throw new BadRequestException(
          'Only orders for pick-up can be marked as item received',
        );
      }

      const item = await em.findOne(InventoryItem, {
        where: { id: order.inventoryItemId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) {
        throw new NotFoundException('Inventory item not found');
      }
      if (item.status !== INVENTORY_STATUS_FOR_PICKUP) {
        throw new BadRequestException(
          'Inventory item is not for pick-up',
        );
      }

      const dateSoldAt = new Date();
      const beforeItem = cloneInventoryItemForAudit(item);
      item.status = INVENTORY_STATUS_SOLD_UNDER_WARRANTY;
      item.dateSold = dateSoldAt;
      item.updatedById = user.userId;
      await em.save(item);
      await this.inventoryAudit.recordDiff(
        item.id,
        beforeItem,
        item,
        await this.auditActor(user),
        em,
      );

      const before = cloneOrderForAudit(order);
      if (isCreditLinePaymentType(order.paymentType)) {
        const allPaid = await this.areAllInstallmentsPaid(order.id, em);
        order.status = allPaid
          ? ORDER_STATUS_ITEM_RECEIVED_PAID
          : ORDER_STATUS_ITEM_RECEIVED_UNPAID;
      } else {
        order.status = ORDER_STATUS_ITEM_RECEIVED;
      }
      order.updatedById = user.userId;
      await em.save(order);
      await this.orderAudit.recordDiff(
        order.id,
        before,
        order,
        await this.auditActor(user),
        em,
      );

      let consignorClientId = item.consignorId;
      let consignorOfferPrice: string | null = null;
      if (item.inquiryId) {
        const inquiry = await em.findOne(Inquiry, {
          where: { id: item.inquiryId },
        });
        if (!consignorClientId) {
          consignorClientId = inquiry?.consignorId ?? null;
        }
        consignorOfferPrice = inquiry?.offerPrice ?? null;
      }

      await this.clientActivityTotals.applySoldUnderWarrantyTotals(em, {
        buyerClientId: order.customerId,
        purchasePesos: purchaseAmountPesosFromOrder(order),
        consignorClientId,
        consignmentPesos: consignorPricePesosFromOffer(consignorOfferPrice),
        actorUserId: user.userId,
      });

      if (
        item.inquiryId &&
        item.transactionType === 'consignment' &&
        order.paymentType !== PAYMENT_TYPE_LAYAWAY &&
        consignorClientId
      ) {
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
    await this.enforceOrderMutationAccessOnOrder(user, order);
    this.assertInstallmentScheduleAccessible(order);
    await this.ensureInstallments(order, user.userId);

    const amount = parseMoney(dto.amountPaid);
    if (amount < 0) {
      throw new BadRequestException('Amount paid cannot be negative');
    }

    const row = await this.findInstallmentForOrder(orderId, installmentNumber);
    const before = cloneInstallmentForAudit(row);
    row.amountPaid = formatMoney(amount);
    row.updatedById = user.userId;
    await this.installmentsRepo.save(row);
    await this.orderAudit.recordInstallmentDiff(
      orderId,
      row,
      before,
      await this.auditActor(user),
    );

    return this.findOneForStaff(orderId);
  }

  async requestInstallmentPenaltyWaiveForStaff(
    user: JwtUser,
    orderId: string,
    installmentNumber: number,
  ): Promise<StaffOrderDetail> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    await this.enforceOrderMutationAccessOnOrder(user, order);
    this.assertInstallmentScheduleAccessible(order);
    await this.ensureInstallments(order, user.userId);

    const rows = await this.installmentsRepo.find({
      where: { orderId },
      order: { installmentNumber: 'ASC' },
    });
    const row = await this.findInstallmentForOrder(orderId, installmentNumber);
    if (isInstallmentPaidStatus(row.status)) {
      throw new BadRequestException('Paid installments cannot have a penalty waive');
    }
    if (isPenaltyWaivePending(row.penaltyWaiveStatus)) {
      throw new BadRequestException('A penalty waive is already pending approval');
    }
    if (isPenaltyWaived(row.penaltyWaiveStatus)) {
      throw new BadRequestException('This penalty has already been waived');
    }

    const amountDue = computeAmountDueForInstallment(rows, installmentNumber);
    const paymentStartDate = formatOrderDate(order.layawayPaymentStartDate);
    const currentPenalty = resolveInstallmentPenalty(
      row,
      amountDue,
      paymentStartDate,
      todayDateString(),
    );
    const amount = parseMoney(currentPenalty);
    if (amount <= 0) {
      throw new BadRequestException('There is no penalty to waive');
    }

    const gm = await this.findGeneralManager();
    if (!gm) {
      throw new BadRequestException(
        'No General Manager is registered to approve this request.',
      );
    }

    const before = cloneInstallmentForAudit(row);
    row.penalty = formatMoney(amount);
    row.penaltyWaiveStatus = PENALTY_WAIVE_STATUS_PENDING;
    row.updatedById = user.userId;
    await this.installmentsRepo.save(row);
    await this.orderAudit.recordInstallmentDiff(
      orderId,
      row,
      before,
      await this.auditActor(user),
    );

    await this.notifications.notify({
      message: `Penalty waive requested for order #${order.orderNumber}, installment ${installmentNumber}. Please review.`,
      receiverId: gm.id,
      orderId: order.id,
    });

    return this.findOneForStaff(orderId);
  }

  async approveInstallmentPenaltyWaiveForStaff(
    user: JwtUser,
    orderId: string,
    installmentNumber: number,
  ): Promise<StaffOrderDetail> {
    await this.requireGeneralManager(user);
    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    this.assertInstallmentScheduleAccessible(order);
    await this.ensureInstallments(order, user.userId);

    const row = await this.findInstallmentForOrder(orderId, installmentNumber);
    if (isInstallmentPaidStatus(row.status)) {
      throw new BadRequestException('Paid installments cannot have a penalty waive');
    }
    if (!isPenaltyWaivePending(row.penaltyWaiveStatus)) {
      throw new BadRequestException('There is no pending penalty waive to approve');
    }

    const before = cloneInstallmentForAudit(row);
    row.penalty = formatMoney(0);
    row.penaltyOverridden = true;
    row.penaltyWaiveStatus = PENALTY_WAIVE_STATUS_APPROVED;
    row.updatedById = user.userId;
    await this.installmentsRepo.save(row);
    await this.orderAudit.recordInstallmentDiff(
      orderId,
      row,
      before,
      await this.auditActor(user),
    );

    await this.notifyAssignedSalesAssociate(
      order,
      `Penalty waive for order #${order.orderNumber}, installment ${installmentNumber} was approved.`,
      order.id,
    );

    return this.findOneForStaff(orderId);
  }

  async rejectInstallmentPenaltyWaiveForStaff(
    user: JwtUser,
    orderId: string,
    installmentNumber: number,
  ): Promise<StaffOrderDetail> {
    await this.requireGeneralManager(user);
    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    this.assertInstallmentScheduleAccessible(order);
    await this.ensureInstallments(order, user.userId);

    const rows = await this.installmentsRepo.find({
      where: { orderId },
      order: { installmentNumber: 'ASC' },
    });
    const row = await this.findInstallmentForOrder(orderId, installmentNumber);
    if (!isPenaltyWaivePending(row.penaltyWaiveStatus)) {
      throw new BadRequestException('There is no pending penalty waive to reject');
    }

    const amountDue = computeAmountDueForInstallment(rows, installmentNumber);
    const paymentStartDate = formatOrderDate(order.layawayPaymentStartDate);
    const dueDate = effectiveDueDateForInstallment(row, paymentStartDate);
    const autoPenalty = computeAutoPenalty(
      amountDue,
      row.amountPaid,
      dueDate,
      todayDateString(),
    );

    const before = cloneInstallmentForAudit(row);
    row.penaltyOverridden = false;
    row.penaltyWaiveStatus = null;
    row.penalty = autoPenalty > 0 ? formatMoney(autoPenalty) : null;
    row.updatedById = user.userId;
    await this.installmentsRepo.save(row);
    await this.orderAudit.recordInstallmentDiff(
      orderId,
      row,
      before,
      await this.auditActor(user),
    );

    await this.notifyAssignedSalesAssociate(
      order,
      `Penalty waive for order #${order.orderNumber}, installment ${installmentNumber} was rejected.`,
      order.id,
    );

    return this.findOneForStaff(orderId);
  }

  async setInstallmentDueDateForStaff(
    user: JwtUser,
    orderId: string,
    installmentNumber: number,
    dto: UpdateInstallmentDueDateDto,
  ): Promise<StaffOrderDetail> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    await this.enforceOrderMutationAccessOnOrder(user, order);
    this.assertInstallmentScheduleAccessible(order);
    await this.ensureInstallments(order, user.userId);
    await this.backfillInstallmentDueDates(order, user.userId);

    const row = await this.findInstallmentForOrder(orderId, installmentNumber);
    const before = cloneInstallmentForAudit(row);
    row.dueDate = formatOrderDate(dto.dueDate);
    row.updatedById = user.userId;
    await this.installmentsRepo.save(row);
    await this.orderAudit.recordInstallmentDiff(
      orderId,
      row,
      before,
      await this.auditActor(user),
    );

    return this.findOneForStaff(orderId);
  }

  async setInstallmentPaymentDateForStaff(
    user: JwtUser,
    orderId: string,
    installmentNumber: number,
    dto: UpdateInstallmentPaymentDateDto,
  ): Promise<StaffOrderDetail> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    await this.enforceOrderMutationAccessOnOrder(user, order);
    this.assertInstallmentScheduleAccessible(order);
    await this.ensureInstallments(order, user.userId);

    const row = await this.findInstallmentForOrder(orderId, installmentNumber);
    const before = cloneInstallmentForAudit(row);
    row.paymentDate = formatOrderDate(dto.paymentDate);
    row.updatedById = user.userId;
    await this.installmentsRepo.save(row);
    await this.orderAudit.recordInstallmentDiff(
      orderId,
      row,
      before,
      await this.auditActor(user),
    );

    return this.findOneForStaff(orderId);
  }

  async markInstallmentPaidForStaff(
    user: JwtUser,
    orderId: string,
    installmentNumber: number,
    dto: MarkInstallmentPaidDto,
    proofFile: MulterFile | undefined,
  ): Promise<StaffOrderDetail> {
    const amount = parseMoney(dto.amountPaid);
    if (amount < 0) {
      throw new BadRequestException('Amount paid cannot be negative');
    }

    const paymentDate = formatOrderDate(dto.paymentDate);
    if (!paymentDate) {
      throw new BadRequestException('Payment date is required');
    }

    await this.featureAccess.assertAccess(
      user.userId,
      user.isAdmin,
      'payment-verification',
      'edit',
    );

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

      this.assertInstallmentNotPendingPenaltyWaive(row);

      const beforeInstallment = cloneInstallmentForAudit(row);
      const beforeOrder = cloneOrderForAudit(order);
      const amountDue = computeAmountDueForInstallment(rows, installmentNumber);
      const paymentStartDate = formatOrderDate(order.layawayPaymentStartDate);
      const dueDate = effectiveDueDateForInstallment(row, paymentStartDate);

      if (!isPenaltyAmountFrozen(row)) {
        const autoPenalty = computeAutoPenalty(
          amountDue,
          row.amountPaid,
          dueDate,
          paymentDate,
        );
        row.penalty = autoPenalty > 0 ? formatMoney(autoPenalty) : null;
      }

      const penaltyAmount = parseMoney(row.penalty);
      const totalRequired = amountDue + penaltyAmount;
      if (Math.round(amount * 100) < Math.round(totalRequired * 100)) {
        throw new BadRequestException(
          penaltyAmount > 0
            ? `Amount paid must be at least ${formatMoney(totalRequired)} for this installment (includes ${formatMoney(penaltyAmount)} penalty)`
            : `Amount paid must be at least ${formatMoney(totalRequired)} for this installment`,
        );
      }

      const hasExistingProof = await this.media.hasMedia(
        MediaOwnerType.ORDER_INSTALLMENT,
        row.id,
        MediaPurpose.PAYMENT_PROOF,
      );
      if (!proofFile?.buffer?.length && !hasExistingProof) {
        throw new BadRequestException('Proof of payment is required');
      }

      row.amountPaid = formatMoney(amount);
      row.paymentDate = paymentDate;
      row.modeOfPayment = dto.modeOfPayment;
      row.updatedById = user.userId;

      if (proofFile?.buffer?.length) {
        const mime = proofFile.mimetype?.toLowerCase() ?? '';
        if (!ALLOWED_PROOF_MIMES.has(mime)) {
          throw new BadRequestException(
            `Proof must be an image or PDF (${proofFile.mimetype || 'unknown'})`,
          );
        }

        const ext = extFromProofMime(mime);
        const storageKey = `orders/${orderId}/installments/${installmentNumber}/proof-${randomUUID()}.${ext}`;
        await this.media.replaceSingle(
          MediaOwnerType.ORDER_INSTALLMENT,
          row.id,
          MediaPurpose.PAYMENT_PROOF,
          proofFile,
          storageKey,
          {
            uploadedByUserId: user.userId,
            createdById: user.userId,
          },
        );
        row.proofUploadedAt = new Date();
        row.proofUploadedByUserId = user.userId;
      }

      const markedPaidAt = new Date();
      row.status = ORDER_INSTALLMENT_STATUS_PAID;
      row.markedPaidAt = markedPaidAt;
      await em.save(row);
      await this.orderAudit.recordInstallmentDiff(
        orderId,
        row,
        beforeInstallment,
        await this.auditActor(user),
        em,
      );

      if (
        order.consignorPaymentRelease != null &&
        installmentNumber === order.consignorPaymentRelease &&
        order.paymentType === PAYMENT_TYPE_LAYAWAY
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
        if (isCreditLinePaymentType(order.paymentType)) {
          if (
            order.status === ORDER_STATUS_ITEM_RECEIVED_UNPAID ||
            order.status === ORDER_STATUS_ITEM_RECEIVED
          ) {
            order.status = ORDER_STATUS_ITEM_RECEIVED_PAID;
          }
        } else {
          order.status = ORDER_STATUS_PAID;
        }
        order.updatedById = user.userId;
        await em.save(order);
        await this.orderAudit.recordDiff(
          order.id,
          beforeOrder,
          order,
          await this.auditActor(user),
          em,
        );
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
    await this.enforceOrderMutationAccessOnOrder(user, order);

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
    await this.enforceOrderMutationAccessOnOrder(user, order);

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
    amountPaidRaw: string | undefined,
    paymentDateRaw: string | undefined,
    modeOfPaymentRaw: string | undefined,
  ): Promise<StaffOrderDetail> {
    if (!proofFile?.buffer?.length) {
      throw new BadRequestException('Proof file is required');
    }

    const detailsDto = await this.parseMarkInstallmentPaidDto({
      amountPaid: amountPaidRaw ?? '',
      paymentDate: paymentDateRaw ?? '',
      modeOfPayment: modeOfPaymentRaw ?? '',
    });

    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    await this.enforceOrderMutationAccessOnOrder(user, order);
    this.assertInstallmentScheduleAccessible(order);
    await this.ensureInstallments(order, user.userId);

    const mime = proofFile.mimetype?.toLowerCase() ?? '';
    if (!ALLOWED_PROOF_MIMES.has(mime)) {
      throw new BadRequestException(
        `Proof must be an image or PDF (${proofFile.mimetype || 'unknown'})`,
      );
    }

    const installment = await this.findInstallmentForOrder(orderId, installmentNumber);
    const previousStatus =
      installment.status?.trim() || ORDER_INSTALLMENT_STATUS_UNPAID;
    if (previousStatus === ORDER_INSTALLMENT_STATUS_PAID) {
      throw new BadRequestException('Installment is already marked as paid');
    }

    const before = cloneInstallmentForAudit(installment);
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

    const amount = parseMoney(detailsDto.amountPaid);
    const paymentDate = formatOrderDate(detailsDto.paymentDate);
    const proofUploadedAt = new Date();
    await this.installmentsRepo.update(
      { orderId, installmentNumber },
      {
        status: ORDER_INSTALLMENT_STATUS_FOR_PAYMENT_VERIFICATION,
        amountPaid: amount != null ? formatMoney(amount) : null,
        paymentDate,
        modeOfPayment: detailsDto.modeOfPayment,
        proofUploadedAt,
        proofUploadedByUserId: user.userId,
        updatedById: user.userId,
      },
    );
    installment.status = ORDER_INSTALLMENT_STATUS_FOR_PAYMENT_VERIFICATION;
    installment.amountPaid = amount != null ? formatMoney(amount) : null;
    installment.paymentDate = paymentDate;
    installment.modeOfPayment = detailsDto.modeOfPayment;
    installment.proofUploadedAt = proofUploadedAt;
    await this.orderAudit.recordInstallmentDiff(
      orderId,
      installment,
      before,
      await this.auditActor(user),
    );

    if (!isInstallmentAwaitingVerification(previousStatus)) {
      await this.notifyPaymentVerificationNeeded({
        order,
      });
    }

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
    const previousStatus =
      installment.status?.trim() || ORDER_INSTALLMENT_STATUS_UNPAID;
    if (previousStatus === ORDER_INSTALLMENT_STATUS_PAID) {
      throw new BadRequestException('Installment is already marked as paid');
    }

    const before = cloneInstallmentForAudit(installment);
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

    const proofUploadedAt = new Date();
    await this.installmentsRepo.update(
      { orderId, installmentNumber },
      {
        status: ORDER_INSTALLMENT_STATUS_FOR_PAYMENT_VERIFICATION,
        proofUploadedAt,
        proofUploadedByUserId: user.userId,
        updatedById: user.userId,
      },
    );
    installment.status = ORDER_INSTALLMENT_STATUS_FOR_PAYMENT_VERIFICATION;
    installment.proofUploadedAt = proofUploadedAt;
    await this.orderAudit.recordInstallmentDiff(
      orderId,
      installment,
      before,
      await this.auditActor(user),
    );

    if (!isInstallmentAwaitingVerification(previousStatus)) {
      await this.notifyPaymentVerificationNeeded({
        order,
      });
    }

    return this.findOneForClient(user, orderId);
  }

  async uploadOrderPaymentProofForStaff(
    user: JwtUser,
    orderId: string,
    proofFile: MulterFile | undefined,
    amountPaidRaw: string | undefined,
    paymentDateRaw: string | undefined,
    modeOfPaymentRaw: string | undefined,
  ): Promise<StaffOrderDetail> {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId },
      relations: { inventoryItem: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    await this.enforceOrderMutationAccessOnOrder(user, order);

    const detailsDto = await this.parseMarkOrderPaymentPaidDto({
      amountPaid: amountPaidRaw ?? '',
      paymentDate: paymentDateRaw ?? '',
      modeOfPayment: modeOfPaymentRaw ?? '',
    });

    await this.createOrderPaymentWithProof(order, user, proofFile, detailsDto);
    await this.notifyPaymentVerificationNeeded({
      order,
    });
    return this.findOneForStaff(orderId);
  }

  async uploadOrderPaymentProofForClient(
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
      relations: { inventoryItem: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.createOrderPaymentWithProof(order, user, proofFile);
    await this.notifyPaymentVerificationNeeded({
      order,
    });
    return this.findOneForClient(user, orderId);
  }

  async markOrderPaymentPaidForStaff(
    user: JwtUser,
    orderId: string,
    paymentId: string,
    dto: MarkOrderPaymentPaidDto,
  ): Promise<StaffOrderDetail> {
    const confirmDto = await this.parseMarkOrderPaymentPaidDto(dto);
    const amount = parseMoney(confirmDto.amountPaid)!;
    const paymentDate = formatOrderDate(confirmDto.paymentDate)!;

    await this.featureAccess.assertAccess(
      user.userId,
      user.isAdmin,
      'payment-verification',
      'edit',
    );

    await this.dataSource.transaction(async (em) => {
      const order = await em.findOne(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        throw new NotFoundException('Order not found');
      }
      this.assertOrderPaymentsAccessible(order);

      const payment = await em.findOne(OrderPayment, {
        where: { id: paymentId, orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!payment) {
        throw new NotFoundException('Payment not found');
      }
      if (payment.status === ORDER_PAYMENT_STATUS_CONFIRMED) {
        throw new BadRequestException('Payment is already confirmed');
      }

      const hasProof = await this.media.hasMedia(
        MediaOwnerType.ORDER_PAYMENT,
        payment.id,
        MediaPurpose.PAYMENT_PROOF,
      );
      if (!hasProof) {
        throw new BadRequestException('Proof of payment is required');
      }

      const markedPaidAt = new Date();
      const beforePayment = clonePaymentForAudit(payment);
      const beforeOrder = cloneOrderForAudit(order);
      payment.amountPaid = formatMoney(amount);
      payment.paymentDate = paymentDate;
      payment.modeOfPayment = confirmDto.modeOfPayment;
      payment.status = ORDER_PAYMENT_STATUS_CONFIRMED;
      payment.markedPaidAt = markedPaidAt;
      payment.markedPaidByUserId = user.userId;
      payment.updatedById = user.userId;
      await em.save(payment);
      await this.orderAudit.recordPaymentDiff(
        orderId,
        payment,
        beforePayment,
        await this.auditActor(user),
        em,
      );

      order.holdingPeriod = null;
      order.updatedById = user.userId;
      await em.save(order);
      await this.orderAudit.recordDiff(
        order.id,
        beforeOrder,
        order,
        await this.auditActor(user),
        em,
      );
    });

    return this.findOneForStaff(orderId);
  }

  private async findOrderPaymentForOrder(
    orderId: string,
    paymentId: string,
  ): Promise<OrderPayment> {
    const row = await this.orderPaymentsRepo.findOne({
      where: { id: paymentId, orderId },
    });
    if (!row) {
      throw new NotFoundException('Payment not found');
    }
    return row;
  }

  async setOrderPaymentAmountPaidForStaff(
    user: JwtUser,
    orderId: string,
    paymentId: string,
    dto: UpdateOrderPaymentAmountPaidDto,
  ): Promise<StaffOrderDetail> {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId },
      relations: { inventoryItem: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    await this.enforceOrderMutationAccessOnOrder(user, order);
    this.assertOrderPaymentsAccessible(order);

    const amount = parseMoney(dto.amountPaid);
    if (amount == null || amount < 0) {
      throw new BadRequestException('Amount paid cannot be negative');
    }

    const row = await this.findOrderPaymentForOrder(orderId, paymentId);
    if (row.status !== ORDER_PAYMENT_STATUS_CONFIRMED) {
      throw new BadRequestException(
        'Only confirmed payments can have the paid amount updated',
      );
    }

    const before = clonePaymentForAudit(row);
    row.amountPaid = formatMoney(amount);
    row.updatedById = user.userId;
    await this.orderPaymentsRepo.save(row);
    await this.orderAudit.recordPaymentDiff(
      orderId,
      row,
      before,
      await this.auditActor(user),
    );

    return this.findOneForStaff(orderId);
  }

  async setOrderPaymentPaymentDateForStaff(
    user: JwtUser,
    orderId: string,
    paymentId: string,
    dto: UpdateOrderPaymentDateDto,
  ): Promise<StaffOrderDetail> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    await this.enforceOrderMutationAccessOnOrder(user, order);
    this.assertOrderPaymentsAccessible(order);

    const paymentDate = formatOrderDate(dto.paymentDate);
    if (!paymentDate) {
      throw new BadRequestException('Payment date is required');
    }

    const row = await this.findOrderPaymentForOrder(orderId, paymentId);
    if (row.status !== ORDER_PAYMENT_STATUS_CONFIRMED) {
      throw new BadRequestException(
        'Only confirmed payments can have the payment date updated',
      );
    }

    const before = clonePaymentForAudit(row);
    row.paymentDate = paymentDate;
    row.updatedById = user.userId;
    await this.orderPaymentsRepo.save(row);
    await this.orderAudit.recordPaymentDiff(
      orderId,
      row,
      before,
      await this.auditActor(user),
    );

    return this.findOneForStaff(orderId);
  }

  async setOrderTotalPriceForStaff(
    user: JwtUser,
    orderId: string,
    dto: UpdateOrderTotalPriceDto,
  ): Promise<StaffOrderDetail> {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId },
      relations: { inventoryItem: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    await this.enforceOrderMutationAccessOnOrder(user, order);
    if (order.paymentType !== PAYMENT_TYPE_FULL) {
      throw new BadRequestException(
        'Order total price can only be updated on full payment orders',
      );
    }
    this.assertOrderPaymentsAccessible(order);

    const amount = parseMoney(dto.orderTotalPrice);
    if (amount == null || amount < 0) {
      throw new BadRequestException('Order total price cannot be negative');
    }

    const before = cloneOrderForAudit(order);
    order.orderTotalPrice = formatMoney(amount);
    order.updatedById = user.userId;
    await this.ordersRepo.save(order);
    await this.orderAudit.recordDiff(
      order.id,
      before,
      order,
      await this.auditActor(user),
    );

    return this.findOneForStaff(orderId);
  }

  private async parseMarkOrderPaymentPaidDto(
    raw: MarkOrderPaymentPaidDto,
  ): Promise<MarkOrderPaymentPaidDto> {
    const dto = plainToInstance(MarkOrderPaymentPaidDto, raw);
    try {
      await validateOrReject(dto);
    } catch {
      throw new BadRequestException('Invalid payment details');
    }
    const amount = parseMoney(dto.amountPaid);
    if (amount == null || amount < 0) {
      throw new BadRequestException('Amount paid cannot be negative');
    }
    const paymentDate = formatOrderDate(dto.paymentDate);
    if (!paymentDate) {
      throw new BadRequestException('Payment date is required');
    }
    return dto;
  }

  private async parseMarkInstallmentPaidDto(
    raw: MarkInstallmentPaidDto,
  ): Promise<MarkInstallmentPaidDto> {
    const dto = plainToInstance(MarkInstallmentPaidDto, raw);
    try {
      await validateOrReject(dto);
    } catch {
      throw new BadRequestException('Invalid payment details');
    }
    const amount = parseMoney(dto.amountPaid);
    if (amount == null || amount < 0) {
      throw new BadRequestException('Amount paid cannot be negative');
    }
    const paymentDate = formatOrderDate(dto.paymentDate);
    if (!paymentDate) {
      throw new BadRequestException('Payment date is required');
    }
    return dto;
  }

  private async createOrderPaymentWithProof(
    order: Order,
    user: JwtUser,
    proofFile: MulterFile | undefined,
    detailsDto?: MarkOrderPaymentPaidDto,
  ): Promise<void> {
    if (!proofFile?.buffer?.length) {
      throw new BadRequestException('Proof file is required');
    }

    this.assertOrderPaymentsAccessible(order);

    const mime = proofFile.mimetype?.toLowerCase() ?? '';
    if (!ALLOWED_PROOF_MIMES.has(mime)) {
      throw new BadRequestException(
        `Proof must be an image or PDF (${proofFile.mimetype || 'unknown'})`,
      );
    }

    const paymentId = randomUUID();
    const ext = extFromProofMime(mime);
    const storageKey = `orders/${order.id}/payments/${paymentId}/proof-${randomUUID()}.${ext}`;

    const uploadedAt = new Date();
    const amount =
      detailsDto != null ? parseMoney(detailsDto.amountPaid) : null;
    const paymentDate =
      detailsDto != null ? formatOrderDate(detailsDto.paymentDate) : null;

    const payment = this.orderPaymentsRepo.create({
      id: paymentId,
      orderId: order.id,
      status: ORDER_PAYMENT_STATUS_FOR_VERIFICATION,
      amountPaid: amount != null ? formatMoney(amount) : null,
      paymentDate,
      modeOfPayment: detailsDto?.modeOfPayment ?? null,
      proofUploadedAt: uploadedAt,
      proofUploadedByUserId: user.userId,
      markedPaidAt: null,
      markedPaidByUserId: null,
      createdById: user.userId,
      updatedById: user.userId,
    });
    await this.orderPaymentsRepo.save(payment);
    await this.orderAudit.recordPaymentDiff(
      order.id,
      payment,
      null,
      await this.auditActor(user),
    );

    await this.media.replaceSingle(
      MediaOwnerType.ORDER_PAYMENT,
      paymentId,
      MediaPurpose.PAYMENT_PROOF,
      proofFile,
      storageKey,
      {
        uploadedByUserId: user.userId,
        createdById: user.userId,
      },
    );
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

    if (
      isInstallmentPaymentType(dto.paymentType) &&
      dto.layawayMonths == null
    ) {
      throw new BadRequestException(
        'Layaway months are required for layaway and credit line orders',
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
    if (dto.paymentType === PAYMENT_TYPE_CREDIT_LINE && !client.isCreditLine) {
      throw new BadRequestException(
        'Credit line is not available for this account',
      );
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

    const itemPrice = await this.sellingPriceForClient(item, client);
    if (itemPrice == null) {
      throw new BadRequestException('Item price is not set');
    }

    const pickupFields = resolveOrderPickupFields({
      pickupOptionRaw: dto.pickupOption,
      pickupBranchRaw: dto.pickupBranch,
      courierServiceRaw: dto.courierService,
    });

    let layawayPrice: string | null = null;
    let layawayMonthlyPayment: string | null = null;
    let fullPaymentPrice: string | null = null;
    let layawayMonths: number | null = null;
    let status: string;
    let holdingHours: number;

    if (isInstallmentPaymentType(dto.paymentType)) {
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
      }

      const pricing = calculateLayawayPricing(itemPrice, dto.layawayMonths!);
      if (!pricing) {
        throw new BadRequestException('Invalid layaway terms');
      }
      layawayMonths = dto.layawayMonths!;
      layawayPrice = formatDecimal(pricing.layawayPrice);
      layawayMonthlyPayment = formatDecimal(pricing.monthlyPayment);
      fullPaymentPrice = formatDecimal(itemPrice);
      status = installmentApprovalStatusForPaymentType(dto.paymentType);
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
        pickupOption: pickupFields.pickupOption,
        pickupBranch: pickupFields.pickupBranch,
        courierService: pickupFields.courierService,
        holdingPeriod: addHours(createdAt, holdingHours),
        createdById: user.userId,
        updatedById: user.userId,
      });
      await em.save(order);
      await this.orderAudit.recordInitialCreation(
        order,
        await this.auditActor(user),
        em,
      );

      const beforeItem = cloneInventoryItemForAudit(item);
      item.status = INVENTORY_STATUS_ON_HOLD;
      item.updatedById = user.userId;
      await em.save(item);
      await this.inventoryAudit.recordDiff(
        item.id,
        beforeItem,
        item,
        await this.auditActor(user),
        em,
      );

      return order;
    });

    return this.toClientSummary(saved);
  }

  async createOrderForStaff(
    user: JwtUser,
    payloadRaw: string | undefined,
    signatureFile: MulterFile | undefined,
  ): Promise<{ id: string }> {
    const assignedToId = await this.resolveStaffOrderCreatorAssignment(user);
    if (payloadRaw == null || payloadRaw.trim() === '') {
      throw new BadRequestException('Missing payload');
    }
    if (!signatureFile?.buffer?.length) {
      throw new BadRequestException('Signature image is required');
    }

    let dto: CreateStaffOrderDto;
    try {
      dto = plainToInstance(
        CreateStaffOrderDto,
        JSON.parse(payloadRaw) as object,
        { enableImplicitConversion: true },
      );
      await validateOrReject(dto);
    } catch {
      throw new BadRequestException('Invalid order payload');
    }

    if (
      isInstallmentPaymentType(dto.paymentType) &&
      dto.layawayMonths == null
    ) {
      throw new BadRequestException(
        'Layaway months are required for layaway and credit line orders',
      );
    }

    const mime = signatureFile.mimetype?.toLowerCase() ?? '';
    if (!ALLOWED_IMAGE_MIMES.has(mime)) {
      throw new BadRequestException(
        `Signature must be an image file (${signatureFile.mimetype || 'unknown'})`,
      );
    }

    const client = await this.clientsRepo.findOne({
      where: { id: dto.customerId },
    });
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    if (dto.paymentType === PAYMENT_TYPE_CREDIT_LINE && !client.isCreditLine) {
      throw new BadRequestException(
        'Credit line is not available for this client',
      );
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
      throw new BadRequestException(
        'The selected client cannot purchase their own consigned item.',
      );
    }

    const itemPrice = await this.sellingPriceForClient(item, client);
    if (itemPrice == null) {
      throw new BadRequestException('Item price is not set');
    }

    const pickupFields = resolveOrderPickupFields({
      pickupOptionRaw: dto.pickupOption,
      pickupBranchRaw: dto.pickupBranch,
      courierServiceRaw: dto.courierService,
    });

    let layawayPrice: string | null = null;
    let layawayMonthlyPayment: string | null = null;
    let fullPaymentPrice: string | null = null;
    let layawayMonths: number | null = null;
    let status: string;
    let holdingHours: number;

    if (isInstallmentPaymentType(dto.paymentType)) {
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
      }

      const pricing = calculateLayawayPricing(itemPrice, dto.layawayMonths!);
      if (!pricing) {
        throw new BadRequestException('Invalid layaway terms');
      }
      layawayMonths = dto.layawayMonths!;
      layawayPrice = formatDecimal(pricing.layawayPrice);
      layawayMonthlyPayment = formatDecimal(pricing.monthlyPayment);
      fullPaymentPrice = formatDecimal(itemPrice);
      status = installmentApprovalStatusForPaymentType(dto.paymentType);
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
        assignedToId,
        paymentType: dto.paymentType,
        layawayMonths,
        layawayPrice,
        layawayMonthlyPayment,
        fullPaymentPrice,
        pickupOption: pickupFields.pickupOption,
        pickupBranch: pickupFields.pickupBranch,
        courierService: pickupFields.courierService,
        holdingPeriod: addHours(createdAt, holdingHours),
        createdById: user.userId,
        updatedById: user.userId,
      });
      await em.save(order);
      await this.orderAudit.recordInitialCreation(
        order,
        await this.auditActor(user),
        em,
      );

      const beforeItem = cloneInventoryItemForAudit(item);
      item.status = INVENTORY_STATUS_ON_HOLD;
      item.updatedById = user.userId;
      await em.save(item);
      await this.inventoryAudit.recordDiff(
        item.id,
        beforeItem,
        item,
        await this.auditActor(user),
        em,
      );

      return order;
    });

    return { id: saved.id };
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

    const pickupFields = resolveOrderPickupFields({
      pickupOptionRaw: dto.pickupOption,
      pickupBranchRaw: dto.pickupBranch,
      courierServiceRaw: dto.courierService,
    });

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
        reservationPaymentStatus: PAYMENT_STATUS_FOR_VERIFICATION,
        pickupOption: pickupFields.pickupOption,
        pickupBranch: pickupFields.pickupBranch,
        courierService: pickupFields.courierService,
        holdingPeriod: addHours(createdAt, RESERVATION_HOLDING_HOURS),
        createdById: user.userId,
        updatedById: user.userId,
      });
      await em.save(order);
      await this.orderAudit.recordInitialCreation(
        order,
        await this.auditActor(user),
        em,
      );

      const beforeItem = cloneInventoryItemForAudit(item);
      item.status = INVENTORY_STATUS_ON_HOLD;
      item.updatedById = user.userId;
      await em.save(item);
      await this.inventoryAudit.recordDiff(
        item.id,
        beforeItem,
        item,
        await this.auditActor(user),
        em,
      );

      return order;
    });

    await this.notifyPaymentVerificationNeeded({
      order: saved,
      kind: 'reservation',
    });

    return this.toClientSummary(saved);
  }

  async confirmReservationPaymentForStaff(
    user: JwtUser,
    orderId: string,
  ): Promise<StaffOrderDetail> {
    await this.featureAccess.assertAccess(
      user.userId,
      user.isAdmin,
      'payment-verification',
      'edit',
    );

    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.status !== ORDER_STATUS_RESERVATION) {
      throw new BadRequestException(
        'Reservation payment can only be verified while the order is reserved',
      );
    }
    if (!isPaymentAwaitingVerification(order.reservationPaymentStatus)) {
      throw new BadRequestException(
        'This reservation fee is not awaiting payment verification',
      );
    }
    if (order.reservationPaymentProofUploadedAt == null) {
      throw new BadRequestException(
        'Upload reservation payment proof before verifying',
      );
    }

    const before = cloneOrderForAudit(order);
    order.reservationPaymentStatus = PAYMENT_STATUS_CONFIRMED;
    order.updatedById = user.userId;
    await this.ordersRepo.save(order);
    await this.orderAudit.recordDiff(
      order.id,
      before,
      order,
      await this.auditActor(user),
    );

    return this.findOneForStaff(orderId);
  }

  async recalculateInstallmentPenalties(): Promise<number> {
    const today = todayDateString();
    const orders = await this.ordersRepo.find({
      where: {
        paymentType: PAYMENT_TYPE_LAYAWAY,
        status: ORDER_STATUS_FOR_PAYMENT,
      },
    });

    let updatedCount = 0;
    for (const order of orders) {
      await this.ensureInstallments(order);
      await this.backfillInstallmentDueDates(order);

      const rows = await this.installmentsRepo.find({
        where: { orderId: order.id },
        order: { installmentNumber: 'ASC' },
      });
      const paymentStartDate = formatOrderDate(order.layawayPaymentStartDate);
      const toSave: OrderInstallment[] = [];

      for (const row of rows) {
        if (isInstallmentPaidStatus(row.status) || isPenaltyAmountFrozen(row)) {
          continue;
        }

        const amountDue = computeAmountDueForInstallment(
          rows,
          row.installmentNumber,
        );
        const dueDate = effectiveDueDateForInstallment(row, paymentStartDate);
        const autoPenalty = computeAutoPenalty(
          amountDue,
          row.amountPaid,
          dueDate,
          today,
        );
        const nextPenalty = autoPenalty > 0 ? formatMoney(autoPenalty) : null;
        if (row.penalty !== nextPenalty) {
          const before = cloneInstallmentForAudit(row);
          row.penalty = nextPenalty;
          toSave.push(row);
          await this.orderAudit.recordInstallmentDiff(
            order.id,
            row,
            before,
            this.orderAudit.systemActor(),
          );
        }
      }

      if (toSave.length > 0) {
        await this.installmentsRepo.save(toSave);
        updatedCount += toSave.length;
      }
    }

    return updatedCount;
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
          ORDER_STATUS_FOR_CREDIT_LINE_APPROVAL,
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
            lockedOrder.status !== ORDER_STATUS_FOR_CREDIT_LINE_APPROVAL &&
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

        const beforeItem = cloneInventoryItemForAudit(lockedItem);
        lockedItem.status = INVENTORY_STATUS_AVAILABLE_FOR_PURCHASE;
        await em.save(lockedItem);
        await this.inventoryAudit.recordDiff(
          lockedItem.id,
          beforeItem,
          lockedItem,
          this.inventoryAudit.systemActor(),
          em,
        );

        const before = cloneOrderForAudit(lockedOrder);
        lockedOrder.status = ORDER_STATUS_EXPIRED;
        await em.save(lockedOrder);
        await this.orderAudit.recordDiff(
          lockedOrder.id,
          before,
          lockedOrder,
          this.orderAudit.systemActor(),
          em,
        );
        return true;
      });

      if (didExpire) expiredCount += 1;
    }

    return expiredCount;
  }

  async applyVoucherForStaff(
    user: JwtUser,
    orderId: string,
    dto: ApplyVoucherDto,
  ): Promise<StaffOrderDetail> {
    await this.enforceOrderMutationAccess(user, orderId);
    await this.applyVoucherToOrder(user.userId, orderId, dto.voucherId);
    return this.findOneForStaff(orderId);
  }

  async applyVoucherForClient(
    user: JwtUser,
    orderId: string,
    dto: ApplyVoucherDto,
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
    await this.applyVoucherToOrder(user.userId, orderId, dto.voucherId);
    return this.findOneForClient(user, orderId);
  }

  private voucherExpirationYmd(expirationDate: Date | string): string {
    if (typeof expirationDate === 'string') {
      return expirationDate.slice(0, 10);
    }
    const y = expirationDate.getUTCFullYear();
    const m = String(expirationDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(expirationDate.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private async applyVoucherToOrder(
    userId: string,
    orderId: string,
    voucherId: string,
  ): Promise<void> {
    const orderPreview = await this.ordersRepo.findOne({
      where: { id: orderId },
      relations: { inventoryItem: true },
    });
    if (!orderPreview) {
      throw new NotFoundException('Order not found');
    }
    if (isInstallmentPaymentType(orderPreview.paymentType)) {
      this.assertInstallmentScheduleAccessible(orderPreview);
      await this.ensureInstallments(orderPreview, userId);
    }

    await this.dataSource.transaction(async (em) => {
      const order = await em.findOne(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        throw new NotFoundException('Order not found');
      }
      if (!isVoucherApplicableOrderStatus(order.status)) {
        throw new BadRequestException(
          'Vouchers cannot be applied while the order is in this status',
        );
      }

      const voucher = await em.findOne(Voucher, {
        where: { id: voucherId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!voucher) {
        throw new NotFoundException('Voucher not found');
      }
      if (voucher.clientId !== order.customerId) {
        throw new BadRequestException(
          'Voucher does not belong to this customer',
        );
      }
      if (voucher.status !== VOUCHER_STATUS_ACTIVE) {
        throw new BadRequestException('Voucher is not active');
      }
      const today = calendarDateStringInTimeZone(new Date());
      if (this.voucherExpirationYmd(voucher.expirationDate) < today) {
        throw new BadRequestException('Voucher has expired');
      }

      const voucherAmount = parseMoney(voucher.amount);
      if (voucherAmount <= 0) {
        throw new BadRequestException('Voucher amount is invalid');
      }

      const paymentDate = today;
      const now = new Date();

      if (isInstallmentPaymentType(order.paymentType)) {
        await this.applyVoucherToNextInstallment(
          em,
          order,
          voucher,
          voucherAmount,
          userId,
          paymentDate,
          now,
        );
      } else if (order.paymentType === PAYMENT_TYPE_FULL) {
        const inventoryItem = await em.findOne(InventoryItem, {
          where: { id: order.inventoryItemId },
        });
        if (!inventoryItem) {
          throw new NotFoundException('Inventory item not found');
        }
        order.inventoryItem = inventoryItem;
        await this.applyVoucherToFullPaymentOrder(
          em,
          order,
          voucher,
          voucherAmount,
          userId,
          paymentDate,
          now,
        );
      } else {
        throw new BadRequestException(
          'Vouchers cannot be applied to this payment type',
        );
      }

      voucher.status = VOUCHER_STATUS_REDEEMED;
      voucher.updatedById = userId;
      await em.save(voucher);
    });
  }

  private async applyVoucherToFullPaymentOrder(
    em: EntityManager,
    order: Order,
    voucher: Voucher,
    voucherAmount: number,
    userId: string,
    paymentDate: string,
    now: Date,
  ): Promise<void> {
    if (!shouldIncludeOrderPayments(order)) {
      throw new BadRequestException('Payments are not available for this order');
    }
    if (
      order.status !== ORDER_STATUS_FOR_PAYMENT &&
      order.status !== ORDER_STATUS_RESERVATION
    ) {
      throw new BadRequestException('Payments are not available for this order');
    }

    const paymentRows = await em.find(OrderPayment, {
      where: { orderId: order.id },
    });
    const itemPrice = liveInventoryUnitPrice(order.inventoryItem);
    const remainingStr = computeOrderPaymentRemainingBalance(
      order,
      paymentRows,
      itemPrice,
    );
    const amountDue = parseMoney(remainingStr);
    if (amountDue <= 0) {
      throw new BadRequestException('Nothing remaining to pay on this order');
    }

    const { appliedAmount } = computeVoucherAppliedAmount(
      voucherAmount,
      amountDue,
    );
    if (appliedAmount <= 0) {
      throw new BadRequestException('Nothing remaining to pay on this order');
    }

    const payment = em.create(OrderPayment, {
      id: randomUUID(),
      orderId: order.id,
      status: ORDER_PAYMENT_STATUS_CONFIRMED,
      amountPaid: formatMoney(appliedAmount),
      paymentDate,
      modeOfPayment: PAYMENT_MODE_CREDIT_VOUCHER,
      voucherId: voucher.id,
      proofUploadedAt: now,
      proofUploadedByUserId: userId,
      markedPaidAt: now,
      markedPaidByUserId: userId,
      createdById: userId,
      updatedById: userId,
    });
    await em.save(payment);
    await this.orderAudit.recordPaymentDiff(
      order.id,
      payment,
      null,
      await this.auditActorFromUserId(userId),
      em,
    );

    const beforeOrder = cloneOrderForAudit(order);
    order.holdingPeriod = null;
    order.updatedById = userId;
    await em.save(order);
    await this.orderAudit.recordDiff(
      order.id,
      beforeOrder,
      order,
      await this.auditActorFromUserId(userId),
      em,
    );
  }

  private async applyVoucherToNextInstallment(
    em: EntityManager,
    order: Order,
    voucher: Voucher,
    voucherAmount: number,
    userId: string,
    paymentDate: string,
    now: Date,
  ): Promise<void> {
    this.assertInstallmentScheduleAccessible(order);

    const rows = await em.find(OrderInstallment, {
      where: { orderId: order.id },
      order: { installmentNumber: 'ASC' },
    });
    const row = rows.find(
      (installment) =>
        (installment.status?.trim() || ORDER_INSTALLMENT_STATUS_UNPAID) !==
        ORDER_INSTALLMENT_STATUS_PAID,
    );
    if (!row) {
      throw new BadRequestException('No unpaid installments remain');
    }

    this.assertInstallmentNotPendingPenaltyWaive(row);

    const installmentNumber = row.installmentNumber;
    const amountDue = computeAmountDueForInstallment(rows, installmentNumber);
    const paymentStartDate = formatOrderDate(order.layawayPaymentStartDate);
    const dueDate = effectiveDueDateForInstallment(row, paymentStartDate);

    if (!isPenaltyAmountFrozen(row)) {
      const autoPenalty = computeAutoPenalty(
        amountDue,
        row.amountPaid,
        dueDate,
        paymentDate,
      );
      row.penalty = autoPenalty > 0 ? formatMoney(autoPenalty) : null;
    }

    const penaltyAmount = parseMoney(row.penalty);
    const totalRequired = amountDue + penaltyAmount;
    if (totalRequired <= 0) {
      throw new BadRequestException('Nothing remaining to pay on this installment');
    }

    const { appliedAmount } = computeVoucherAppliedAmount(
      voucherAmount,
      totalRequired,
    );
    if (appliedAmount <= 0) {
      throw new BadRequestException('Nothing remaining to pay on this installment');
    }

    const before = cloneInstallmentForAudit(row);
    row.amountPaid = formatMoney(appliedAmount);
    row.paymentDate = paymentDate;
    row.modeOfPayment = PAYMENT_MODE_CREDIT_VOUCHER;
    row.voucherId = voucher.id;
    row.status = ORDER_INSTALLMENT_STATUS_PAID;
    row.markedPaidAt = now;
    row.updatedById = userId;
    await em.save(row);
    await this.orderAudit.recordInstallmentDiff(
      order.id,
      row,
      before,
      await this.auditActorFromUserId(userId),
      em,
    );

    await this.runInstallmentPaidSideEffects(
      em,
      order,
      installmentNumber,
      now,
      userId,
    );
  }

  private async runInstallmentPaidSideEffects(
    em: EntityManager,
    order: Order,
    installmentNumber: number,
    markedPaidAt: Date,
    userId: string,
  ): Promise<void> {
    if (
      order.consignorPaymentRelease != null &&
      installmentNumber === order.consignorPaymentRelease &&
      order.paymentType === PAYMENT_TYPE_LAYAWAY
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
      const before = cloneOrderForAudit(order);
      if (isCreditLinePaymentType(order.paymentType)) {
        if (
          order.status === ORDER_STATUS_ITEM_RECEIVED_UNPAID ||
          order.status === ORDER_STATUS_ITEM_RECEIVED
        ) {
          order.status = ORDER_STATUS_ITEM_RECEIVED_PAID;
        }
      } else {
        order.status = ORDER_STATUS_PAID;
      }
      order.updatedById = userId;
      await em.save(order);
      await this.orderAudit.recordDiff(
        order.id,
        before,
        order,
        await this.auditActorFromUserId(userId),
        em,
      );
    }
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
