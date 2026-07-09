import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { Order } from '../orders/entities/order.entity';
import { INVENTORY_STATUS_PAID_TO_CONSIGNOR } from '../orders/order-status.constants';
import { InquiryStatus } from '../enums/inquiry-status.enum';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CONSIGNMENT_COORDINATOR_POSITION } from '../notifications/notification.constants';
import {
  Inquiry,
  type InquiryItemSnapshot,
} from '../inquiries/entities/inquiry.entity';
import { UpdateConsignorPaymentGroupStatusDto } from './dto/update-consignor-payment-group-status.dto';
import {
  ALLOWED_CONSIGNOR_PAYMENT_IMAGE_MIMES,
  CONSIGNOR_PAYMENT_CHECK_NUMBER_MAX_LENGTH,
  checkPhotoStorageKey,
  depositSlipStorageKey,
  parseRetainedCheckPhotoKeys,
  unableToSendPhotoStorageKey,
} from './consignor-payment-image.util';
import {
  CONSIGNOR_PAYMENT_GROUP_STATUS_PAYMENT_SENT,
  CONSIGNOR_PAYMENT_GROUP_STATUS_UNPAID,
  CONSIGNOR_PAYMENT_GROUP_STATUS_UNABLE_TO_SEND,
  CONSIGNOR_PAYMENT_STATUS_APPROVED,
  CONSIGNOR_PAYMENT_STATUS_PENDING,
} from './consignor-payment.constants';
import {
  ConsignorPayment,
  ConsignorPaymentGroup,
  ConsignorPaymentItem,
} from './entities/consignor-payment.entities';
import { JwtUser } from '../auth/jwt-user';
import { MediaOwnerType } from '../enums/media-owner-type.enum';
import { MediaPurpose } from '../enums/media-purpose.enum';
import { MediaService } from '../media/media.service';
import { S3StorageService } from '../media/s3-storage.service';
import type { MediaKeyUrl } from '../media/media.types';
import type { MulterFile } from '../inquiries/multer-file.type';

export type RecordConsignorPaymentItemParams = {
  inquiryId: string;
  consignorClientId: string;
  /** YYYY-MM-DD in app calendar timezone. */
  auditDate: string;
};

export type ConsignorPaymentListRow = {
  id: string;
  auditDate: string;
  status: string;
  groupCount: number;
  itemCount: number;
};

export type ConsignorPaymentItemRow = {
  id: string;
  inquiryId: string;
  inquirySku: string;
  itemLabel: string;
  offerPrice: string | null;
  inventoryItemId: string | null;
  inventorySku: string | null;
  orderId: string | null;
  orderNumber: number | null;
};

export type ConsignorPaymentGroupRow = {
  id: string;
  clientId: string;
  consignorName: string;
  consignorEmail: string;
  preferredPaymentMethod:
    | 'check_pickup'
    | 'cash_pickup'
    | 'direct_deposit'
    | null;
  preferredPaymentBranch: 'pasig' | 'makati' | null;
  bankCode: 'bdo' | 'bpi' | 'other' | null;
  status: string;
  checkNumber: string | null;
  checkPhotos: MediaKeyUrl[];
  depositSlipPhotos: MediaKeyUrl[];
  items: ConsignorPaymentItemRow[];
};

export type ConsignorPaymentDetail = {
  id: string;
  auditDate: string;
  status: string;
  groups: ConsignorPaymentGroupRow[];
};

function formatPgDate(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function itemLabelFromSnapshot(
  snapshot: InquiryItemSnapshot | null | undefined,
): string {
  return brandModelFromSnapshot(snapshot) || 'Item';
}

function brandModelFromSnapshot(
  snapshot: InquiryItemSnapshot | null | undefined,
): string {
  if (!snapshot?.form) return '';
  const form = snapshot.form as { brand?: string; itemModel?: string };
  const brand = (form.brand ?? '').trim();
  const model = (form.itemModel ?? '').trim();
  if (!brand && !model) return '';
  if (!brand) return model;
  if (!model) return brand;
  return `${brand} - ${model}`;
}

function parseOfferPrice(raw: string | null | undefined): number {
  if (raw == null || String(raw).trim() === '') return 0;
  const n = Number.parseFloat(String(raw));
  return Number.isFinite(n) ? n : 0;
}

function formatPhpAmount(value: number): string {
  return `₱${value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function clientDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  email: string | null | undefined,
): string {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  return name || email?.trim() || 'Consignor';
}

@Injectable()
export class ConsignorPaymentsService {
  private readonly logger = new Logger(ConsignorPaymentsService.name);

  constructor(
    @InjectRepository(ConsignorPayment)
    private readonly paymentsRepo: Repository<ConsignorPayment>,
    @InjectRepository(InventoryItem)
    private readonly inventoryRepo: Repository<InventoryItem>,
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
    private readonly media: MediaService,
    private readonly s3: S3StorageService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAllForStaff(): Promise<ConsignorPaymentListRow[]> {
    const payments = await this.paymentsRepo.find({
      relations: { groups: { items: true } },
      order: { auditDate: 'DESC' },
    });

    return payments.map((payment) => ({
      id: payment.id,
      auditDate: formatPgDate(payment.auditDate),
      status: payment.status,
      groupCount: payment.groups?.length ?? 0,
      itemCount:
        payment.groups?.reduce(
          (sum, group) => sum + (group.items?.length ?? 0),
          0,
        ) ?? 0,
    }));
  }

  async findOneForStaff(id: string): Promise<ConsignorPaymentDetail> {
    const payment = await this.paymentsRepo.findOne({
      where: { id },
      relations: {
        groups: {
          client: true,
          items: { inquiry: true },
        },
      },
    });
    if (!payment) {
      throw new NotFoundException('Consignor payment not found');
    }

    const inquiryIds =
      payment.groups?.flatMap((group) =>
        (group.items ?? []).map((item) => item.inquiryId),
      ) ?? [];
    const inventoryByInquiry = new Map<
      string,
      { id: string; sku: string }
    >();
    const orderByInventoryItemId = new Map<
      string,
      { id: string; orderNumber: number }
    >();
    if (inquiryIds.length > 0) {
      const inventoryRows = await this.inventoryRepo.find({
        where: { inquiryId: In(inquiryIds) },
        select: { id: true, inquiryId: true, sku: true },
      });
      for (const row of inventoryRows) {
        if (row.inquiryId) {
          inventoryByInquiry.set(row.inquiryId, {
            id: row.id,
            sku: row.sku,
          });
        }
      }

      const inventoryItemIds = inventoryRows.map((row) => row.id);
      if (inventoryItemIds.length > 0) {
        const orderRows = await this.ordersRepo.find({
          where: { inventoryItemId: In(inventoryItemIds) },
          select: { id: true, inventoryItemId: true, orderNumber: true },
        });
        for (const order of orderRows) {
          orderByInventoryItemId.set(order.inventoryItemId, {
            id: order.id,
            orderNumber: order.orderNumber,
          });
        }
      }
    }

    const groups: ConsignorPaymentGroupRow[] = await Promise.all(
      (payment.groups ?? []).map(async (group) => {
        const client = group.client;
        const items: ConsignorPaymentItemRow[] = (group.items ?? []).map(
          (item) => {
            const inquiry = item.inquiry;
            const inventory = inventoryByInquiry.get(item.inquiryId);
            const order = inventory
              ? orderByInventoryItemId.get(inventory.id)
              : undefined;
            return {
              id: item.id,
              inquiryId: item.inquiryId,
              inquirySku: inquiry?.sku ?? '—',
              itemLabel: itemLabelFromSnapshot(inquiry?.itemSnapshot),
              offerPrice:
                inquiry?.offerPrice != null &&
                String(inquiry.offerPrice).trim() !== ''
                  ? String(inquiry.offerPrice)
                  : null,
              inventoryItemId: inventory?.id ?? null,
              inventorySku: inventory?.sku ?? null,
              orderId: order?.id ?? null,
              orderNumber: order?.orderNumber ?? null,
            };
          },
        );
        items.sort((a, b) => a.inquirySku.localeCompare(b.inquirySku));

        const checkPhotoRows = await this.media.findByOwner(
          MediaOwnerType.CONSIGNOR_PAYMENT_GROUP,
          group.id,
          { purpose: MediaPurpose.CHECK_PHOTO, orderBySort: true },
        );
        const depositSlipPhotoRows = await this.media.findByOwner(
          MediaOwnerType.CONSIGNOR_PAYMENT_GROUP,
          group.id,
          { purpose: MediaPurpose.DEPOSIT_SLIP_PHOTO, orderBySort: true },
        );

        return {
          id: group.id,
          clientId: group.clientId,
          consignorName: clientDisplayName(
            client?.firstName,
            client?.lastName,
            client?.email,
          ),
          consignorEmail: client?.email?.trim() ?? '',
          preferredPaymentMethod: client?.preferredPaymentMethod ?? null,
          preferredPaymentBranch: client?.preferredPaymentBranch ?? null,
          bankCode:
            client?.bankCode === 'bdo' ||
            client?.bankCode === 'bpi' ||
            client?.bankCode === 'other'
              ? (client.bankCode as 'bdo' | 'bpi' | 'other')
              : null,
          status: group.status?.trim() || CONSIGNOR_PAYMENT_GROUP_STATUS_UNPAID,
          checkNumber: group.checkNumber?.trim() || null,
          checkPhotos: this.media.toKeyUrlList(checkPhotoRows),
          depositSlipPhotos: this.media.toKeyUrlList(depositSlipPhotoRows),
          items,
        };
      }),
    );
    groups.sort((a, b) => a.consignorName.localeCompare(b.consignorName));

    return {
      id: payment.id,
      auditDate: formatPgDate(payment.auditDate),
      status: payment.status,
      groups,
    };
  }

  async approveForStaff(id: string): Promise<ConsignorPaymentDetail> {
    const payment = await this.paymentsRepo.findOne({ where: { id } });
    if (!payment) {
      throw new NotFoundException('Consignor payment not found');
    }
    if (payment.status !== CONSIGNOR_PAYMENT_STATUS_PENDING) {
      throw new BadRequestException(
        'Only pending consignor payment batches can be approved',
      );
    }
    payment.status = CONSIGNOR_PAYMENT_STATUS_APPROVED;
    await this.paymentsRepo.save(payment);
    return this.findOneForStaff(id);
  }

  async updateGroupStatusForStaff(
    paymentId: string,
    groupId: string,
    dto: UpdateConsignorPaymentGroupStatusDto,
  ): Promise<ConsignorPaymentDetail> {
    const payment = await this.paymentsRepo.findOne({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException('Consignor payment not found');
    }
    if (payment.status !== CONSIGNOR_PAYMENT_STATUS_APPROVED) {
      throw new BadRequestException(
        'Group status can only be updated when the payment batch is approved',
      );
    }

    const group = await this.paymentsRepo.manager.findOne(ConsignorPaymentGroup, {
      where: { id: groupId, consignorPaymentsId: paymentId },
    });
    if (!group) {
      throw new NotFoundException('Consignor payment group not found');
    }

    const wasAlreadyPaymentSent =
      group.status?.trim() === CONSIGNOR_PAYMENT_GROUP_STATUS_PAYMENT_SENT;
    const markingPaymentSent =
      dto.status === CONSIGNOR_PAYMENT_GROUP_STATUS_PAYMENT_SENT &&
      !wasAlreadyPaymentSent;

    if (markingPaymentSent) {
      let emailPayload: {
        to: string;
        firstName: string;
        items: Array<{ brandModel: string; priceLabel: string }>;
        totalAmountLabel: string;
        depositSlipStorageKeys: string[];
      } | null = null;

      await this.paymentsRepo.manager.transaction(async (em) => {
        const fullGroup = await em.findOne(ConsignorPaymentGroup, {
          where: { id: groupId, consignorPaymentsId: paymentId },
          relations: { client: true, items: { inquiry: true } },
        });
        if (!fullGroup) {
          throw new NotFoundException('Consignor payment group not found');
        }

        fullGroup.status = dto.status;
        await em.save(fullGroup);

        const inquiryIds = (fullGroup.items ?? []).map((item) => item.inquiryId);
        if (inquiryIds.length > 0) {
          await em.update(
            Inquiry,
            { id: In(inquiryIds) },
            { status: InquiryStatus.PAID_TO_CONSIGNOR },
          );
          await em.update(
            InventoryItem,
            { inquiryId: In(inquiryIds) },
            { status: INVENTORY_STATUS_PAID_TO_CONSIGNOR },
          );
        }

        const depositSlipRows = await this.media.findByOwner(
          MediaOwnerType.CONSIGNOR_PAYMENT_GROUP,
          fullGroup.id,
          { purpose: MediaPurpose.DEPOSIT_SLIP_PHOTO, orderBySort: true },
        );

        const items = (fullGroup.items ?? []).map((item) => {
          const inquiry = item.inquiry;
          const price = parseOfferPrice(
            inquiry?.offerPrice != null ? String(inquiry.offerPrice) : null,
          );
          return {
            brandModel:
              brandModelFromSnapshot(inquiry?.itemSnapshot) || 'Item',
            priceLabel: formatPhpAmount(price),
          };
        });
        const totalAmount = (fullGroup.items ?? []).reduce(
          (sum, item) =>
            sum +
            parseOfferPrice(
              item.inquiry?.offerPrice != null
                ? String(item.inquiry.offerPrice)
                : null,
            ),
          0,
        );

        const client = fullGroup.client;
        const email = client?.email?.trim() ?? '';
        if (email) {
          emailPayload = {
            to: email,
            firstName: client?.firstName?.trim() || 'there',
            items,
            totalAmountLabel: formatPhpAmount(totalAmount),
            depositSlipStorageKeys: depositSlipRows.map((row) => row.storageKey),
          };
        }
      });

      if (emailPayload) {
        void this.sendConsignorPaymentSentEmail(emailPayload).catch((err) => {
          this.logger.error(
            `Failed to send consignor payment notice for group ${groupId}`,
            err instanceof Error ? err.stack : String(err),
          );
        });
      }
    } else {
      group.status = dto.status;
      await this.paymentsRepo.manager.save(group);
    }

    return this.findOneForStaff(paymentId);
  }

  private async sendConsignorPaymentSentEmail(params: {
    to: string;
    firstName: string;
    items: Array<{ brandModel: string; priceLabel: string }>;
    totalAmountLabel: string;
    depositSlipStorageKeys: string[];
  }): Promise<void> {
    if (!this.mail.isConfigured()) {
      this.logger.debug(
        'MAIL_* not configured; skipping consignor payment sent email',
      );
      return;
    }

    const attachments: Array<{
      filename: string;
      content: Buffer;
      contentType: string;
    }> = [];
    for (const [index, storageKey] of params.depositSlipStorageKeys.entries()) {
      try {
        const object = await this.s3.getObject(storageKey);
        const ext = storageKey.includes('.')
          ? storageKey.slice(storageKey.lastIndexOf('.'))
          : '';
        attachments.push({
          filename: `deposit-slip-${index + 1}${ext}`,
          content: object.buffer,
          contentType: object.contentType,
        });
      } catch (err) {
        this.logger.warn(
          `Could not attach deposit slip ${storageKey} for consignor payment email`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    await this.mail.sendConsignorPaymentSentNotice({
      to: params.to,
      firstName: params.firstName,
      items: params.items,
      totalAmountLabel: params.totalAmountLabel,
      attachments,
    });
  }

  async markGroupUnableToSendForStaff(
    paymentId: string,
    groupId: string,
    user: JwtUser,
    reasonRaw: string | undefined,
    photoFile: MulterFile | undefined,
  ): Promise<ConsignorPaymentDetail> {
    const payment = await this.paymentsRepo.findOne({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException('Consignor payment not found');
    }
    if (payment.status !== CONSIGNOR_PAYMENT_STATUS_APPROVED) {
      throw new BadRequestException(
        'Group status can only be updated when the payment batch is approved',
      );
    }

    const reason = reasonRaw?.trim() ?? '';
    if (!reason) {
      throw new BadRequestException('Reason is required');
    }

    const group = await this.paymentsRepo.manager.findOne(ConsignorPaymentGroup, {
      where: { id: groupId, consignorPaymentsId: paymentId },
    });
    if (!group) {
      throw new NotFoundException('Consignor payment group not found');
    }
    if (group.status?.trim() === CONSIGNOR_PAYMENT_GROUP_STATUS_UNABLE_TO_SEND) {
      throw new BadRequestException(
        'This consignor payment group is already marked as unable to send',
      );
    }

    if (photoFile?.buffer?.length) {
      const mime = photoFile.mimetype?.toLowerCase() ?? '';
      if (!ALLOWED_CONSIGNOR_PAYMENT_IMAGE_MIMES.has(mime)) {
        throw new BadRequestException(
          `Unsupported image type: ${photoFile.mimetype || 'unknown'}`,
        );
      }
    }

    let notifyPayload: {
      consignorName: string;
      consignorEmail: string;
      firstName: string;
      auditDateLabel: string;
      reason: string;
      inquiryId: string | null;
      photoStorageKey: string | null;
    } | null = null;

    await this.paymentsRepo.manager.transaction(async (em) => {
      const fullGroup = await em.findOne(ConsignorPaymentGroup, {
        where: { id: groupId, consignorPaymentsId: paymentId },
        relations: { client: true, items: { inquiry: true } },
      });
      if (!fullGroup) {
        throw new NotFoundException('Consignor payment group not found');
      }

      fullGroup.status = CONSIGNOR_PAYMENT_GROUP_STATUS_UNABLE_TO_SEND;
      fullGroup.unableToSendReason = reason;
      await em.save(fullGroup);

      let photoStorageKey: string | null = null;
      if (photoFile?.buffer?.length) {
        const saved = await this.media.replaceSingle(
          MediaOwnerType.CONSIGNOR_PAYMENT_GROUP,
          fullGroup.id,
          MediaPurpose.UNABLE_TO_SEND_PHOTO,
          photoFile,
          unableToSendPhotoStorageKey(fullGroup.id, photoFile),
          { uploadedByUserId: user.userId, createdById: user.userId },
        );
        photoStorageKey = saved.storageKey;
      }

      const client = fullGroup.client;
      const email = client?.email?.trim() ?? '';
      const firstInquiryId = fullGroup.items?.[0]?.inquiryId ?? null;
      notifyPayload = {
        consignorName: clientDisplayName(
          client?.firstName,
          client?.lastName,
          client?.email,
        ),
        consignorEmail: email,
        firstName: client?.firstName?.trim() || 'there',
        auditDateLabel: formatPgDate(payment.auditDate),
        reason,
        inquiryId: firstInquiryId,
        photoStorageKey,
      };
    });

    if (notifyPayload) {
      void this.notifyUnableToSendConsignorAndCoordinators(notifyPayload).catch(
        (err) => {
          this.logger.error(
            `Failed to notify consignor/coordinators for unable-to-send group ${groupId}`,
            err instanceof Error ? err.stack : String(err),
          );
        },
      );
    }

    return this.findOneForStaff(paymentId);
  }

  private async notifyUnableToSendConsignorAndCoordinators(params: {
    consignorName: string;
    consignorEmail: string;
    firstName: string;
    auditDateLabel: string;
    reason: string;
    inquiryId: string | null;
    photoStorageKey: string | null;
  }): Promise<void> {
    const coordinatorMessage = `Consignor payment could not be sent to ${params.consignorName} (audit ${params.auditDateLabel}): ${params.reason}`;
    void this.notifications
      .notify({
        message: coordinatorMessage,
        receiverRole: CONSIGNMENT_COORDINATOR_POSITION,
        inquiryId: params.inquiryId,
      })
      .catch((err) => {
        this.logger.error(
          'Failed to notify coordinators of unable-to-send consignor payment',
          err instanceof Error ? err.stack : String(err),
        );
      });

    if (!params.consignorEmail) {
      return;
    }
    if (!this.mail.isConfigured()) {
      this.logger.debug(
        'MAIL_* not configured; skipping unable-to-send consignor email',
      );
      return;
    }

    const attachments: Array<{
      filename: string;
      content: Buffer;
      contentType: string;
    }> = [];
    if (params.photoStorageKey) {
      try {
        const object = await this.s3.getObject(params.photoStorageKey);
        const ext = params.photoStorageKey.includes('.')
          ? params.photoStorageKey.slice(params.photoStorageKey.lastIndexOf('.'))
          : '';
        attachments.push({
          filename: `unable-to-send${ext}`,
          content: object.buffer,
          contentType: object.contentType,
        });
      } catch (err) {
        this.logger.warn(
          `Could not attach unable-to-send photo ${params.photoStorageKey}`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    await this.mail.sendConsignorPaymentUnableToSendNotice({
      to: params.consignorEmail,
      firstName: params.firstName,
      auditDateLabel: params.auditDateLabel,
      reason: params.reason,
      attachments,
    });
  }

  async saveCheckForStaff(
    paymentId: string,
    groupId: string,
    user: JwtUser,
    checkNumberRaw: string | undefined,
    retainedKeysRaw: string | undefined,
    files: MulterFile[],
  ): Promise<ConsignorPaymentDetail> {
    const payment = await this.paymentsRepo.findOne({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException('Consignor payment not found');
    }
    if (payment.status !== CONSIGNOR_PAYMENT_STATUS_APPROVED) {
      throw new BadRequestException(
        'Check details can only be saved when the payment batch is approved',
      );
    }

    const group = await this.paymentsRepo.manager.findOne(ConsignorPaymentGroup, {
      where: { id: groupId, consignorPaymentsId: paymentId },
    });
    if (!group) {
      throw new NotFoundException('Consignor payment group not found');
    }

    const checkNumber = checkNumberRaw?.trim() ?? '';
    if (!checkNumber) {
      throw new BadRequestException('Check number is required');
    }
    if (checkNumber.length > CONSIGNOR_PAYMENT_CHECK_NUMBER_MAX_LENGTH) {
      throw new BadRequestException(
        `Check number must be at most ${CONSIGNOR_PAYMENT_CHECK_NUMBER_MAX_LENGTH} characters`,
      );
    }

    const uploadFiles = files ?? [];
    for (const file of uploadFiles) {
      const mime = file.mimetype?.toLowerCase() ?? '';
      if (!ALLOWED_CONSIGNOR_PAYMENT_IMAGE_MIMES.has(mime)) {
        throw new BadRequestException(
          `Unsupported image type: ${file.mimetype || 'unknown'}`,
        );
      }
    }

    const retainedKeys = parseRetainedCheckPhotoKeys(retainedKeysRaw);
    if (retainedKeys.length + uploadFiles.length < 1) {
      throw new BadRequestException('At least one check photo is required');
    }

    await this.media.replaceGallery(
      MediaOwnerType.CONSIGNOR_PAYMENT_GROUP,
      group.id,
      MediaPurpose.CHECK_PHOTO,
      retainedKeys,
      uploadFiles,
      (_index, file) => checkPhotoStorageKey(group.id, file),
      { uploadedByUserId: user.userId },
    );

    group.checkNumber = checkNumber;
    await this.paymentsRepo.manager.save(group);
    return this.findOneForStaff(paymentId);
  }

  async saveDepositSlipForStaff(
    paymentId: string,
    groupId: string,
    user: JwtUser,
    retainedKeysRaw: string | undefined,
    files: MulterFile[],
  ): Promise<ConsignorPaymentDetail> {
    const payment = await this.paymentsRepo.findOne({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException('Consignor payment not found');
    }
    if (payment.status !== CONSIGNOR_PAYMENT_STATUS_APPROVED) {
      throw new BadRequestException(
        'Deposit slip can only be saved when the payment batch is approved',
      );
    }

    const group = await this.paymentsRepo.manager.findOne(ConsignorPaymentGroup, {
      where: { id: groupId, consignorPaymentsId: paymentId },
    });
    if (!group) {
      throw new NotFoundException('Consignor payment group not found');
    }

    const uploadFiles = files ?? [];
    for (const file of uploadFiles) {
      const mime = file.mimetype?.toLowerCase() ?? '';
      if (!ALLOWED_CONSIGNOR_PAYMENT_IMAGE_MIMES.has(mime)) {
        throw new BadRequestException(
          `Unsupported image type: ${file.mimetype || 'unknown'}`,
        );
      }
    }

    const retainedKeys = parseRetainedCheckPhotoKeys(retainedKeysRaw);
    if (retainedKeys.length + uploadFiles.length < 1) {
      throw new BadRequestException('At least one deposit slip photo is required');
    }

    await this.media.replaceGallery(
      MediaOwnerType.CONSIGNOR_PAYMENT_GROUP,
      group.id,
      MediaPurpose.DEPOSIT_SLIP_PHOTO,
      retainedKeys,
      uploadFiles,
      (_index, file) => depositSlipStorageKey(group.id, file),
      { uploadedByUserId: user.userId },
    );

    return this.findOneForStaff(paymentId);
  }

  async recordItemForSoldFinalConsignment(
    manager: EntityManager,
    params: RecordConsignorPaymentItemParams,
  ): Promise<void> {
    const existingItem = await manager.findOne(ConsignorPaymentItem, {
      where: { inquiryId: params.inquiryId },
    });
    if (existingItem) {
      return;
    }

    const payment = await this.findOrCreatePayment(manager, params.auditDate);
    const group = await this.findOrCreateGroup(
      manager,
      payment.id,
      params.consignorClientId,
    );

    await manager.save(
      ConsignorPaymentItem,
      manager.create(ConsignorPaymentItem, {
        inquiryId: params.inquiryId,
        consignorPaymentGroup: group,
      }),
    );
  }

  private async findOrCreatePayment(
    manager: EntityManager,
    auditDate: string,
  ): Promise<ConsignorPayment> {
    const existing = await manager.findOne(ConsignorPayment, {
      where: { auditDate: auditDate as unknown as Date },
    });
    if (existing) {
      return existing;
    }

    try {
      return await manager.save(
        ConsignorPayment,
        manager.create(ConsignorPayment, {
          auditDate: auditDate as unknown as Date,
          status: CONSIGNOR_PAYMENT_STATUS_PENDING,
        }),
      );
    } catch {
      const raced = await manager.findOne(ConsignorPayment, {
        where: { auditDate: auditDate as unknown as Date },
      });
      if (raced) {
        return raced;
      }
      throw new Error(
        `Failed to find or create consignor payment for audit date ${auditDate}`,
      );
    }
  }

  private async findOrCreateGroup(
    manager: EntityManager,
    consignorPaymentsId: string,
    clientId: string,
  ): Promise<ConsignorPaymentGroup> {
    const existing = await manager.findOne(ConsignorPaymentGroup, {
      where: { consignorPaymentsId, clientId },
    });
    if (existing) {
      return existing;
    }

    try {
      return await manager.save(
        ConsignorPaymentGroup,
        manager.create(ConsignorPaymentGroup, {
          consignorPaymentsId,
          clientId,
          status: CONSIGNOR_PAYMENT_GROUP_STATUS_UNPAID,
        }),
      );
    } catch {
      const raced = await manager.findOne(ConsignorPaymentGroup, {
        where: { consignorPaymentsId, clientId },
      });
      if (raced) {
        return raced;
      }
      throw new Error(
        `Failed to find or create consignor payment group for client ${clientId}`,
      );
    }
  }
}
