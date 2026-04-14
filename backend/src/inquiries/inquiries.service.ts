import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { Between, Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
import { InquiryStatus } from '../enums/inquiry-status.enum';
import { JwtUser } from '../auth/jwt-user';
import { UpdateInquiryNotesDto } from './dto/update-inquiry-notes.dto';
import { SubmitOfferDto } from './dto/submit-offer.dto';
import { SubmitConsignmentInquiryDto } from './dto/submit-consignment-inquiry.dto';
import { Inquiry, InquiryItemSnapshot } from './entities/inquiry.entity';
import type { MulterFile } from './multer-file.type';
import { S3StorageService } from './s3-storage.service';

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m === 'image/jpeg') return 'jpg';
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/gif') return 'gif';
  if (m === 'image/heic' || m === 'image/heif') return 'heic';
  return 'bin';
}

/** UTC calendar day bounds for `d`. */
function utcDayRange(d: Date): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
  const end = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
  return { start, end };
}

/** Lock key for pg_advisory_xact_lock (one distinct value per UTC calendar day). */
function utcDayLockKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * INQ-YYYY-MMDD-NN — NN is the 1-based index of inquiries created that UTC day.
 * Sequence is padded to at least 2 digits.
 */
function formatInquirySku(ref: Date, sequence: number): string {
  const y = ref.getUTCFullYear();
  const mm = String(ref.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(ref.getUTCDate()).padStart(2, '0');
  const mmdd = `${mm}${dd}`;
  const seq =
    sequence < 100
      ? String(sequence).padStart(2, '0')
      : String(sequence);
  return `INQ-${y}-${mmdd}-${seq}`;
}

function itemLabelFromSnapshot(
  snapshot: InquiryItemSnapshot | null | undefined,
): string {
  if (!snapshot?.form) return 'Item';
  const form = snapshot.form as { brand?: string; itemModel?: string };
  const brand = (form.brand ?? '').trim();
  const model = (form.itemModel ?? '').trim();
  if (!brand && !model) return 'Item';
  if (!brand) return model;
  if (!model) return brand;
  return `${brand} — ${model}`;
}

function snapshotFormString(form: Record<string, unknown>, key: string): string {
  const v = form[key];
  if (v == null) return '';
  return String(v).trim();
}

export type StaffInquiryRow = {
  id: string;
  sku: string;
  itemLabel: string;
  status: InquiryStatus;
  createdAt: Date;
  consignorName: string;
  consignorEmail: string;
  consignorPhone: string;
  brand: string;
  category: string;
  itemModel: string;
  serialNumber: string;
  condition: string;
  inclusions: string;
  consignmentSellingPrice: string;
  directPurchaseSellingPrice: string;
  consentDirectPurchase: boolean;
  consentPriceNomination: boolean;
  photoCount: number;
  offerTransactionType: 'consignment' | 'direct_purchase' | null;
  offerPrice: string | null;
  notes: string | null;
};

export type StaffInquiryDetail = StaffInquiryRow & {
  updatedAt: Date;
  itemSnapshot: {
    clientItemId: string;
    form: Record<string, unknown>;
    images: Array<{ key: string; url: string }>;
  };
};

/** Client-facing inquiry detail (no internal staff notes). */
export type ClientInquiryDetail = Omit<StaffInquiryRow, 'notes'> & {
  updatedAt: Date;
  itemSnapshot: {
    clientItemId: string;
    form: Record<string, unknown>;
    images: Array<{ key: string; url: string }>;
  };
};

@Injectable()
export class InquiriesService {
  constructor(
    @InjectRepository(Inquiry)
    private readonly inquiriesRepo: Repository<Inquiry>,
    @InjectRepository(Client)
    private readonly clientsRepo: Repository<Client>,
    private readonly s3: S3StorageService,
  ) {}

  private mapInquiryToStaffRow(r: Inquiry): StaffInquiryRow {
    const form = (r.itemSnapshot?.form ?? {}) as Record<string, unknown>;
    const c = r.consignor;
    const name = c ? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() : '';
    return {
      id: r.id,
      sku: r.sku,
      itemLabel: itemLabelFromSnapshot(r.itemSnapshot),
      status: r.status,
      createdAt: r.createdAt,
      consignorName: name || '—',
      consignorEmail: c?.email?.trim() ?? '—',
      consignorPhone: c?.contactNumber?.trim() ?? '—',
      brand: snapshotFormString(form, 'brand') || '—',
      category: snapshotFormString(form, 'category') || '—',
      itemModel: snapshotFormString(form, 'itemModel') || '—',
      serialNumber: snapshotFormString(form, 'serialNumber') || '—',
      condition: snapshotFormString(form, 'condition') || '—',
      inclusions: snapshotFormString(form, 'inclusions') || '—',
      consignmentSellingPrice:
        snapshotFormString(form, 'consignmentSellingPrice') || '—',
      directPurchaseSellingPrice:
        snapshotFormString(form, 'directPurchaseSellingPrice') || '—',
      consentDirectPurchase: Boolean(form.consentDirectPurchase),
      consentPriceNomination: Boolean(form.consentPriceNomination),
      photoCount: Array.isArray(r.itemSnapshot?.images)
        ? r.itemSnapshot.images.length
        : 0,
      offerTransactionType: r.offerTransactionType ?? null,
      offerPrice:
        r.offerPrice != null && r.offerPrice !== ''
          ? String(r.offerPrice)
          : null,
      notes: (() => {
        if (r.notes == null) return null;
        const t = String(r.notes).trim();
        return t === '' ? null : t;
      })(),
    };
  }

  /** Staff list: inquiry row + consignor + item snapshot fields for triage. */
  async findAllForStaff(): Promise<StaffInquiryRow[]> {
    const rows = await this.inquiriesRepo.find({
      order: { createdAt: 'DESC' },
      relations: { consignor: true },
    });
    return rows.map((r) => this.mapInquiryToStaffRow(r));
  }

  /** Full inquiry with snapshot and image URLs (refreshed from stored keys). */
  async findOneForStaff(id: string): Promise<StaffInquiryDetail> {
    const r = await this.inquiriesRepo.findOne({
      where: { id },
      relations: { consignor: true },
    });
    if (!r) {
      throw new NotFoundException('Inquiry not found');
    }
    const base = this.mapInquiryToStaffRow(r);
    const rawImages = Array.isArray(r.itemSnapshot?.images)
      ? r.itemSnapshot.images
      : [];
    const images = rawImages.map((img) => ({
      key: img.key,
      url: this.s3.getPublicUrl(img.key),
    }));
    return {
      ...base,
      updatedAt: r.updatedAt,
      itemSnapshot: {
        clientItemId: r.itemSnapshot.clientItemId,
        form: (r.itemSnapshot.form ?? {}) as Record<string, unknown>,
        images,
      },
    };
  }

  async findMineForClient(user: JwtUser): Promise<
    Array<{
      id: string;
      sku: string;
      itemLabel: string;
      status: InquiryStatus;
      createdAt: Date;
    }>
  > {
    const client = await this.clientsRepo.findOne({
      where: { userId: user.userId },
    });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }
    const rows = await this.inquiriesRepo.find({
      where: { consignorId: client.id },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      itemLabel: itemLabelFromSnapshot(r.itemSnapshot),
      status: r.status,
      createdAt: r.createdAt,
    }));
  }

  /** Single inquiry for the logged-in consignor (excludes staff-only notes). */
  async findOneForClient(
    user: JwtUser,
    id: string,
  ): Promise<ClientInquiryDetail> {
    const client = await this.clientsRepo.findOne({
      where: { userId: user.userId },
    });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }
    const r = await this.inquiriesRepo.findOne({
      where: { id, consignorId: client.id },
      relations: { consignor: true },
    });
    if (!r) {
      throw new NotFoundException('Inquiry not found');
    }
    const base = this.mapInquiryToStaffRow(r);
    const { notes: _notes, ...rest } = base;
    const rawImages = Array.isArray(r.itemSnapshot?.images)
      ? r.itemSnapshot.images
      : [];
    const images = rawImages.map((img) => ({
      key: img.key,
      url: this.s3.getPublicUrl(img.key),
    }));
    return {
      ...rest,
      updatedAt: r.updatedAt,
      itemSnapshot: {
        clientItemId: r.itemSnapshot.clientItemId,
        form: (r.itemSnapshot.form ?? {}) as Record<string, unknown>,
        images,
      },
    };
  }

  /** Consignor withdraws the inquiry; only while still active (not terminal). */
  async cancelInquiryForClient(
    user: JwtUser,
    id: string,
  ): Promise<ClientInquiryDetail> {
    const client = await this.clientsRepo.findOne({
      where: { userId: user.userId },
    });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }
    const r = await this.inquiriesRepo.findOne({
      where: { id, consignorId: client.id },
    });
    if (!r) {
      throw new NotFoundException('Inquiry not found');
    }
    if (
      r.status !== InquiryStatus.PENDING &&
      r.status !== InquiryStatus.UNDER_REVIEW &&
      r.status !== InquiryStatus.FOR_OFFER_CONFIRMATION
    ) {
      throw new BadRequestException(
        'Only active inquiries can be cancelled by the consignor',
      );
    }
    r.status = InquiryStatus.CANCELLED;
    await this.inquiriesRepo.save(r);
    return this.findOneForClient(user, id);
  }

  async submitConsignmentInquiry(
    user: JwtUser,
    payloadRaw: string | undefined,
    files: MulterFile[] | undefined,
  ): Promise<{
    inquiries: Array<{ id: string; sku: string; status: InquiryStatus }>;
  }> {
    if (payloadRaw == null || payloadRaw.trim() === '') {
      throw new BadRequestException('Missing payload');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(payloadRaw) as unknown;
    } catch {
      throw new BadRequestException('Invalid JSON payload');
    }

    const dto = plainToInstance(SubmitConsignmentInquiryDto, parsed, {
      enableImplicitConversion: true,
    });
    try {
      await validateOrReject(dto);
    } catch {
      throw new BadRequestException('Invalid inquiry payload');
    }

    const client = await this.clientsRepo.findOne({
      where: { userId: user.userId },
    });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }

    const expectedFiles = dto.items.reduce((n, it) => n + it.imageCount, 0);
    if (!files || files.length !== expectedFiles) {
      throw new BadRequestException(
        `Expected ${expectedFiles} image file(s), received ${files?.length ?? 0}`,
      );
    }

    let fileIdx = 0;
    const refNow = new Date();

    type Planned = { inquiryId: string; itemSnapshot: InquiryItemSnapshot };
    const planned: Planned[] = [];

    for (let itemIdx = 0; itemIdx < dto.items.length; itemIdx++) {
      const row = dto.items[itemIdx];
      const inquiryId = randomUUID();
      const images: InquiryItemSnapshot['images'] = [];

      for (let j = 0; j < row.imageCount; j++) {
        const file = files[fileIdx++];
        const mime = file.mimetype?.toLowerCase() ?? '';
        if (!ALLOWED_IMAGE_MIMES.has(mime)) {
          throw new BadRequestException(
            `Unsupported image type: ${file.mimetype || 'unknown'}`,
          );
        }
        const ext = extFromMime(mime);
        const key = `inquiries/${inquiryId}/${randomUUID()}.${ext}`;
        await this.s3.putObject(key, file.buffer, mime);
        images.push({ key, url: this.s3.getPublicUrl(key) });
      }

      planned.push({
        inquiryId,
        itemSnapshot: {
          clientItemId: row.clientItemId,
          form: { ...row.form } as unknown as Record<string, unknown>,
          images,
        },
      });
    }

    return await this.inquiriesRepo.manager.transaction(async (em) => {
      await em.query(
        `SELECT pg_advisory_xact_lock(hashtext($1::text)::bigint)`,
        [utcDayLockKey(refNow)],
      );

      const bounds = utcDayRange(refNow);
      const countToday = await em.count(Inquiry, {
        where: { createdAt: Between(bounds.start, bounds.end) },
      });

      const results: Array<{
        id: string;
        sku: string;
        status: InquiryStatus;
      }> = [];

      for (let i = 0; i < planned.length; i++) {
        const sku = formatInquirySku(refNow, countToday + i + 1);
        const row = planned[i];
        const inquiry = em.create(Inquiry, {
          id: row.inquiryId,
          consignorId: client.id,
          sku,
          status: InquiryStatus.PENDING,
          itemSnapshot: row.itemSnapshot,
          createdById: null,
          updatedById: null,
        });
        await em.save(inquiry);
        results.push({ id: inquiry.id, sku, status: inquiry.status });
      }

      return { inquiries: results };
    });
  }

  private static readonly terminalInquiryStatuses = new Set<InquiryStatus>([
    InquiryStatus.APPROVED,
    InquiryStatus.REJECTED,
    InquiryStatus.DECLINED,
    InquiryStatus.CANCELLED,
  ]);

  async declineInquiry(id: string): Promise<StaffInquiryDetail> {
    const r = await this.inquiriesRepo.findOne({ where: { id } });
    if (!r) {
      throw new NotFoundException('Inquiry not found');
    }
    if (InquiriesService.terminalInquiryStatuses.has(r.status)) {
      throw new BadRequestException('This inquiry cannot be declined');
    }
    r.status = InquiryStatus.DECLINED;
    await this.inquiriesRepo.save(r);
    return this.findOneForStaff(id);
  }

  async submitOffer(id: string, dto: SubmitOfferDto): Promise<StaffInquiryDetail> {
    const r = await this.inquiriesRepo.findOne({
      where: { id },
      relations: { consignor: true },
    });
    if (!r) {
      throw new NotFoundException('Inquiry not found');
    }
    if (InquiriesService.terminalInquiryStatuses.has(r.status)) {
      throw new BadRequestException('Cannot submit an offer for this inquiry');
    }

    const form = (r.itemSnapshot?.form ?? {}) as Record<string, unknown>;
    const consentDirectPurchase = Boolean(form.consentDirectPurchase);
    if (!consentDirectPurchase && dto.transactionType === 'direct_purchase') {
      throw new BadRequestException(
        'Direct purchase is not available for this inquiry',
      );
    }

    r.offerTransactionType = dto.transactionType;
    r.offerPrice = dto.offerPrice.toFixed(2);
    r.status = InquiryStatus.FOR_OFFER_CONFIRMATION;
    await this.inquiriesRepo.save(r);
    return this.findOneForStaff(id);
  }

  async updateNotes(
    id: string,
    dto: UpdateInquiryNotesDto,
  ): Promise<StaffInquiryDetail> {
    const r = await this.inquiriesRepo.findOne({
      where: { id },
      relations: { consignor: true },
    });
    if (!r) {
      throw new NotFoundException('Inquiry not found');
    }
    const trimmed = dto.notes.trim();
    r.notes = trimmed === '' ? null : trimmed;
    await this.inquiriesRepo.save(r);
    return this.findOneForStaff(id);
  }
}
