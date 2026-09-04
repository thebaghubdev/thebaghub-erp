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
import {
  consignorEmailItemFromSnapshot,
  consignorItemShortLabel,
} from '../mail/consignor-item-details';
import { NotificationsService } from '../notifications/notifications.service';
import { CONSIGNMENT_COORDINATOR_POSITION } from '../notifications/notification.constants';
import {
  Inquiry,
  type InquiryItemSnapshot,
} from '../inquiries/entities/inquiry.entity';
import { UpdateDirectPurchasePaymentStatusDto } from './dto/update-direct-purchase-payment-status.dto';
import {
  ALLOWED_DIRECT_PURCHASE_PAYMENT_IMAGE_MIMES,
  DIRECT_PURCHASE_PAYMENT_CHECK_NUMBER_MAX_LENGTH,
  checkPhotoStorageKey,
  depositSlipStorageKey,
  parseRetainedPhotoKeys,
  unableToSendPhotoStorageKey,
} from './direct-purchase-payment-image.util';
import {
  DIRECT_PURCHASE_PAYMENT_STATUS_PAYMENT_SENT,
  DIRECT_PURCHASE_PAYMENT_STATUS_UNABLE_TO_SEND,
  DIRECT_PURCHASE_PAYMENT_STATUS_UNPAID,
} from './direct-purchase-payment.constants';
import {
  DirectPurchasePayment,
  DirectPurchasePaymentItem,
} from './entities/direct-purchase-payment.entities';
import { JwtUser } from '../auth/jwt-user';
import { MediaOwnerType } from '../enums/media-owner-type.enum';
import { MediaPurpose } from '../enums/media-purpose.enum';
import { MediaService } from '../media/media.service';
import { S3StorageService } from '../media/s3-storage.service';
import type { MediaKeyUrl } from '../media/media.types';
import type { MulterFile } from '../inquiries/multer-file.type';

export type RecordDirectPurchasePaymentItemParams = {
  inquiryId: string;
  consignorClientId: string;
};

export type DirectPurchasePaymentItemRow = {
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

export type DirectPurchasePaymentDetail = {
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
  createdAt: string;
  items: DirectPurchasePaymentItemRow[];
};

export type DirectPurchasePaymentListRow = {
  id: string;
  consignorName: string;
  status: string;
  itemCount: number;
  totalOfferPrice: number;
  createdAt: string;
};

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

function itemDetailsForEmail(
  inquiry:
    | { sku?: string | null; itemSnapshot?: InquiryItemSnapshot | null }
    | null
    | undefined,
): string {
  return (
    consignorItemShortLabel(
      consignorEmailItemFromSnapshot(inquiry?.sku, inquiry?.itemSnapshot),
    ) || 'Item'
  );
}

function parseOfferPrice(raw: string | null | undefined): number {
  if (raw == null || String(raw).trim() === '') return 0;
  const n = Number.parseFloat(String(raw));
  return Number.isFinite(n) ? n : 0;
}

function formatPhpAmount(value: number): string {
  return `₱${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
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

function statusSortRank(status: string): number {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'unpaid') return 0;
  if (normalized === 'unable to send') return 1;
  if (normalized === 'payment sent') return 2;
  return 9;
}

@Injectable()
export class DirectPurchasePaymentsService {
  private readonly logger = new Logger(DirectPurchasePaymentsService.name);

  constructor(
    @InjectRepository(DirectPurchasePayment)
    private readonly paymentsRepo: Repository<DirectPurchasePayment>,
    @InjectRepository(InventoryItem)
    private readonly inventoryRepo: Repository<InventoryItem>,
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
    private readonly media: MediaService,
    private readonly s3: S3StorageService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAllForStaff(): Promise<DirectPurchasePaymentListRow[]> {
    const payments = await this.paymentsRepo.find({
      relations: { client: true, items: { inquiry: true } },
      order: { createdAt: 'DESC' },
    });

    const rows = payments.map((payment) => {
      const items = payment.items ?? [];
      const totalOfferPrice = items.reduce(
        (sum, item) =>
          sum +
          parseOfferPrice(
            item.inquiry?.offerPrice != null
              ? String(item.inquiry.offerPrice)
              : null,
          ),
        0,
      );
      return {
        id: payment.id,
        consignorName: clientDisplayName(
          payment.client?.firstName,
          payment.client?.lastName,
          payment.client?.email,
        ),
        status: payment.status?.trim() || DIRECT_PURCHASE_PAYMENT_STATUS_UNPAID,
        itemCount: items.length,
        totalOfferPrice,
        createdAt: payment.createdAt?.toISOString() ?? '',
      };
    });

    rows.sort((a, b) => {
      const rank = statusSortRank(a.status) - statusSortRank(b.status);
      if (rank !== 0) return rank;
      return b.createdAt.localeCompare(a.createdAt);
    });
    return rows;
  }

  async findOneForStaff(id: string): Promise<DirectPurchasePaymentDetail> {
    const payment = await this.paymentsRepo.findOne({
      where: { id },
      relations: { client: true, items: { inquiry: true } },
    });
    if (!payment) {
      throw new NotFoundException('Direct purchase payment not found');
    }

    const inquiryIds = (payment.items ?? []).map((item) => item.inquiryId);
    const inventoryByInquiry = new Map<string, { id: string; sku: string }>();
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

    const items: DirectPurchasePaymentItemRow[] = (payment.items ?? []).map(
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
      MediaOwnerType.DIRECT_PURCHASE_PAYMENT,
      payment.id,
      { purpose: MediaPurpose.CHECK_PHOTO, orderBySort: true },
    );
    const depositSlipPhotoRows = await this.media.findByOwner(
      MediaOwnerType.DIRECT_PURCHASE_PAYMENT,
      payment.id,
      { purpose: MediaPurpose.DEPOSIT_SLIP_PHOTO, orderBySort: true },
    );

    const client = payment.client;
    return {
      id: payment.id,
      clientId: payment.clientId,
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
      status: payment.status?.trim() || DIRECT_PURCHASE_PAYMENT_STATUS_UNPAID,
      checkNumber: payment.checkNumber?.trim() || null,
      checkPhotos: this.media.toKeyUrlList(checkPhotoRows),
      depositSlipPhotos: this.media.toKeyUrlList(depositSlipPhotoRows),
      createdAt: payment.createdAt?.toISOString() ?? '',
      items,
    };
  }

  async updateStatusForStaff(
    paymentId: string,
    dto: UpdateDirectPurchasePaymentStatusDto,
  ): Promise<DirectPurchasePaymentDetail> {
    const payment = await this.paymentsRepo.findOne({
      where: { id: paymentId },
    });
    if (!payment) {
      throw new NotFoundException('Direct purchase payment not found');
    }

    const wasAlreadyPaymentSent =
      payment.status?.trim() === DIRECT_PURCHASE_PAYMENT_STATUS_PAYMENT_SENT;
    const markingPaymentSent =
      dto.status === DIRECT_PURCHASE_PAYMENT_STATUS_PAYMENT_SENT &&
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
        const fullPayment = await em.findOne(DirectPurchasePayment, {
          where: { id: paymentId },
          relations: { client: true, items: { inquiry: true } },
        });
        if (!fullPayment) {
          throw new NotFoundException('Direct purchase payment not found');
        }

        fullPayment.status = dto.status;
        await em.save(fullPayment);

        const inquiryIds = (fullPayment.items ?? []).map(
          (item) => item.inquiryId,
        );
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
          MediaOwnerType.DIRECT_PURCHASE_PAYMENT,
          fullPayment.id,
          { purpose: MediaPurpose.DEPOSIT_SLIP_PHOTO, orderBySort: true },
        );

        const items = (fullPayment.items ?? []).map((item) => {
          const inquiry = item.inquiry;
          const price = parseOfferPrice(
            inquiry?.offerPrice != null ? String(inquiry.offerPrice) : null,
          );
          return {
            brandModel: itemDetailsForEmail(inquiry),
            priceLabel: formatPhpAmount(price),
          };
        });
        const totalAmount = (fullPayment.items ?? []).reduce(
          (sum, item) =>
            sum +
            parseOfferPrice(
              item.inquiry?.offerPrice != null
                ? String(item.inquiry.offerPrice)
                : null,
            ),
          0,
        );

        const client = fullPayment.client;
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
        void this.sendPaymentSentEmail(emailPayload).catch((err) => {
          this.logger.error(
            `Failed to send direct purchase payment notice for ${paymentId}`,
            err instanceof Error ? err.stack : String(err),
          );
        });
      }
    } else {
      payment.status = dto.status;
      await this.paymentsRepo.save(payment);
    }

    return this.findOneForStaff(paymentId);
  }

  private async sendPaymentSentEmail(params: {
    to: string;
    firstName: string;
    items: Array<{ brandModel: string; priceLabel: string }>;
    totalAmountLabel: string;
    depositSlipStorageKeys: string[];
  }): Promise<void> {
    if (!this.mail.isConfigured()) {
      this.logger.debug(
        'MAIL_* not configured; skipping direct purchase payment sent email',
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
          `Could not attach deposit slip ${storageKey} for direct purchase payment email`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    await this.mail.sendDirectPurchasePaymentSentNotice({
      to: params.to,
      firstName: params.firstName,
      items: params.items,
      totalAmountLabel: params.totalAmountLabel,
      attachments,
    });
  }

  async markUnableToSendForStaff(
    paymentId: string,
    user: JwtUser,
    reasonRaw: string | undefined,
    photoFile: MulterFile | undefined,
  ): Promise<DirectPurchasePaymentDetail> {
    const reason = reasonRaw?.trim() ?? '';
    if (!reason) {
      throw new BadRequestException('Reason is required');
    }

    const payment = await this.paymentsRepo.findOne({
      where: { id: paymentId },
    });
    if (!payment) {
      throw new NotFoundException('Direct purchase payment not found');
    }
    if (
      payment.status?.trim() === DIRECT_PURCHASE_PAYMENT_STATUS_UNABLE_TO_SEND
    ) {
      throw new BadRequestException(
        'This direct purchase payment is already marked as unable to send',
      );
    }

    if (photoFile?.buffer?.length) {
      const mime = photoFile.mimetype?.toLowerCase() ?? '';
      if (!ALLOWED_DIRECT_PURCHASE_PAYMENT_IMAGE_MIMES.has(mime)) {
        throw new BadRequestException(
          `Unsupported image type: ${photoFile.mimetype || 'unknown'}`,
        );
      }
    }

    let notifyPayload: {
      consignorName: string;
      consignorEmail: string;
      firstName: string;
      reason: string;
      inquiryId: string | null;
      items: string[];
      photoStorageKey: string | null;
    } | null = null;

    await this.paymentsRepo.manager.transaction(async (em) => {
      const fullPayment = await em.findOne(DirectPurchasePayment, {
        where: { id: paymentId },
        relations: { client: true, items: { inquiry: true } },
      });
      if (!fullPayment) {
        throw new NotFoundException('Direct purchase payment not found');
      }

      fullPayment.status = DIRECT_PURCHASE_PAYMENT_STATUS_UNABLE_TO_SEND;
      fullPayment.unableToSendReason = reason;
      await em.save(fullPayment);

      let photoStorageKey: string | null = null;
      if (photoFile?.buffer?.length) {
        const saved = await this.media.replaceSingle(
          MediaOwnerType.DIRECT_PURCHASE_PAYMENT,
          fullPayment.id,
          MediaPurpose.UNABLE_TO_SEND_PHOTO,
          photoFile,
          unableToSendPhotoStorageKey(fullPayment.id, photoFile),
          { uploadedByUserId: user.userId, createdById: user.userId },
        );
        photoStorageKey = saved.storageKey;
      }

      const client = fullPayment.client;
      const email = client?.email?.trim() ?? '';
      const firstInquiryId = fullPayment.items?.[0]?.inquiryId ?? null;
      notifyPayload = {
        consignorName: clientDisplayName(
          client?.firstName,
          client?.lastName,
          client?.email,
        ),
        consignorEmail: email,
        firstName: client?.firstName?.trim() || 'there',
        reason,
        inquiryId: firstInquiryId,
        items: (fullPayment.items ?? []).map((item) =>
          itemDetailsForEmail(item.inquiry),
        ),
        photoStorageKey,
      };
    });

    if (notifyPayload) {
      void this.notifyUnableToSendConsignorAndCoordinators(notifyPayload).catch(
        (err) => {
          this.logger.error(
            `Failed to notify consignor/coordinators for unable-to-send payment ${paymentId}`,
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
    reason: string;
    inquiryId: string | null;
    items: string[];
    photoStorageKey: string | null;
  }): Promise<void> {
    const coordinatorMessage = `Direct purchase payment could not be sent to ${params.consignorName}: ${params.reason}`;
    void this.notifications
      .notify({
        message: coordinatorMessage,
        receiverRole: CONSIGNMENT_COORDINATOR_POSITION,
        inquiryId: params.inquiryId,
      })
      .catch((err) => {
        this.logger.error(
          'Failed to notify coordinators of unable-to-send direct purchase payment',
          err instanceof Error ? err.stack : String(err),
        );
      });

    if (!params.consignorEmail) {
      return;
    }
    if (!this.mail.isConfigured()) {
      this.logger.debug(
        'MAIL_* not configured; skipping unable-to-send direct purchase payment email',
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
          ? params.photoStorageKey.slice(
              params.photoStorageKey.lastIndexOf('.'),
            )
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

    await this.mail.sendDirectPurchasePaymentUnableToSendNotice({
      to: params.consignorEmail,
      firstName: params.firstName,
      reason: params.reason,
      items: params.items,
      attachments,
    });
  }

  async saveCheckForStaff(
    paymentId: string,
    user: JwtUser,
    checkNumberRaw: string | undefined,
    retainedKeysRaw: string | undefined,
    files: MulterFile[],
  ): Promise<DirectPurchasePaymentDetail> {
    const payment = await this.paymentsRepo.findOne({
      where: { id: paymentId },
    });
    if (!payment) {
      throw new NotFoundException('Direct purchase payment not found');
    }

    const checkNumber = checkNumberRaw?.trim() ?? '';
    if (!checkNumber) {
      throw new BadRequestException('Check number is required');
    }
    if (checkNumber.length > DIRECT_PURCHASE_PAYMENT_CHECK_NUMBER_MAX_LENGTH) {
      throw new BadRequestException(
        `Check number must be at most ${DIRECT_PURCHASE_PAYMENT_CHECK_NUMBER_MAX_LENGTH} characters`,
      );
    }

    const uploadFiles = files ?? [];
    for (const file of uploadFiles) {
      const mime = file.mimetype?.toLowerCase() ?? '';
      if (!ALLOWED_DIRECT_PURCHASE_PAYMENT_IMAGE_MIMES.has(mime)) {
        throw new BadRequestException(
          `Unsupported image type: ${file.mimetype || 'unknown'}`,
        );
      }
    }

    const retainedKeys = parseRetainedPhotoKeys(retainedKeysRaw);
    if (retainedKeys.length + uploadFiles.length < 1) {
      throw new BadRequestException('At least one check photo is required');
    }

    await this.media.replaceGallery(
      MediaOwnerType.DIRECT_PURCHASE_PAYMENT,
      payment.id,
      MediaPurpose.CHECK_PHOTO,
      retainedKeys,
      uploadFiles,
      (_index, file) => checkPhotoStorageKey(payment.id, file),
      { uploadedByUserId: user.userId },
    );

    payment.checkNumber = checkNumber;
    await this.paymentsRepo.save(payment);
    return this.findOneForStaff(paymentId);
  }

  async saveDepositSlipForStaff(
    paymentId: string,
    user: JwtUser,
    retainedKeysRaw: string | undefined,
    files: MulterFile[],
  ): Promise<DirectPurchasePaymentDetail> {
    const payment = await this.paymentsRepo.findOne({
      where: { id: paymentId },
    });
    if (!payment) {
      throw new NotFoundException('Direct purchase payment not found');
    }

    const uploadFiles = files ?? [];
    for (const file of uploadFiles) {
      const mime = file.mimetype?.toLowerCase() ?? '';
      if (!ALLOWED_DIRECT_PURCHASE_PAYMENT_IMAGE_MIMES.has(mime)) {
        throw new BadRequestException(
          `Unsupported image type: ${file.mimetype || 'unknown'}`,
        );
      }
    }

    const retainedKeys = parseRetainedPhotoKeys(retainedKeysRaw);
    if (retainedKeys.length + uploadFiles.length < 1) {
      throw new BadRequestException(
        'At least one deposit slip photo is required',
      );
    }

    await this.media.replaceGallery(
      MediaOwnerType.DIRECT_PURCHASE_PAYMENT,
      payment.id,
      MediaPurpose.DEPOSIT_SLIP_PHOTO,
      retainedKeys,
      uploadFiles,
      (_index, file) => depositSlipStorageKey(payment.id, file),
      { uploadedByUserId: user.userId },
    );

    return this.findOneForStaff(paymentId);
  }

  async recordItemForContractStart(
    manager: EntityManager,
    params: RecordDirectPurchasePaymentItemParams,
  ): Promise<void> {
    const existingItem = await manager.findOne(DirectPurchasePaymentItem, {
      where: { inquiryId: params.inquiryId },
    });
    if (existingItem) {
      return;
    }

    const payment = await this.findOrCreateUnpaidPayment(
      manager,
      params.consignorClientId,
    );

    await manager.save(
      DirectPurchasePaymentItem,
      manager.create(DirectPurchasePaymentItem, {
        inquiryId: params.inquiryId,
        directPurchasePayment: payment,
      }),
    );
  }

  private async findOrCreateUnpaidPayment(
    manager: EntityManager,
    clientId: string,
  ): Promise<DirectPurchasePayment> {
    const existing = await manager.findOne(DirectPurchasePayment, {
      where: {
        clientId,
        status: DIRECT_PURCHASE_PAYMENT_STATUS_UNPAID,
      },
    });
    if (existing) {
      return existing;
    }

    try {
      return await manager.save(
        DirectPurchasePayment,
        manager.create(DirectPurchasePayment, {
          clientId,
          status: DIRECT_PURCHASE_PAYMENT_STATUS_UNPAID,
        }),
      );
    } catch {
      const raced = await manager.findOne(DirectPurchasePayment, {
        where: {
          clientId,
          status: DIRECT_PURCHASE_PAYMENT_STATUS_UNPAID,
        },
      });
      if (raced) {
        return raced;
      }
      throw new Error(
        `Failed to find or create direct purchase payment for client ${clientId}`,
      );
    }
  }
}
