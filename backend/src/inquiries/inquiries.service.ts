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

export type StaffInquiryRow = {
  id: string;
  sku: string;
  itemLabel: string;
  status: InquiryStatus;
  createdAt: Date;
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

  /** Staff list: one row per item inquiry with display label (no subject column). */
  async findAllForStaff(): Promise<StaffInquiryRow[]> {
    const rows = await this.inquiriesRepo.find({
      order: { createdAt: 'DESC' },
      relations: { consignor: true },
    });
    return rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      itemLabel: itemLabelFromSnapshot(r.itemSnapshot),
      status: r.status,
      createdAt: r.createdAt,
    }));
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
}
