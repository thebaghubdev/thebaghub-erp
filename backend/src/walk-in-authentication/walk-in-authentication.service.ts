import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Between, Repository } from 'typeorm';
import { JwtUser } from '../auth/jwt-user';
import { Employee } from '../employees/entities/employee.entity';
import { canAssignWorkToOthers } from '../employees/employee-position.util';
import { MediaOwnerType } from '../enums/media-owner-type.enum';
import { MediaPurpose } from '../enums/media-purpose.enum';
import { ThirdPartyAuthenticationData } from '../inventory/entities/item-authentication.types';
import { MulterFile } from '../inquiries/multer-file.type';
import { MediaService } from '../media/media.service';
import { BatchAssignWalkInAuthenticatorDto } from './dto/batch-assign-walk-in-authenticator.dto';
import { CompleteWalkInAuthenticationDto } from './dto/complete-walk-in-authentication.dto';
import { CreateWalkInAuthenticationDto } from './dto/create-walk-in-authentication.dto';
import {
  SaveWalkInAuthenticationDto,
  WalkInAuthDetailsDto,
} from './dto/save-walk-in-authentication.dto';
import { WalkInAuthenticationMetric } from './entities/walk-in-authentication-metric.entity';
import { WalkInAuthentication } from './entities/walk-in-authentication.entity';
import {
  WALK_IN_AUTH_STATUS_ASSIGNED,
  WALK_IN_AUTH_STATUS_COMPLETED,
  WALK_IN_AUTH_STATUS_PENDING,
} from './walk-in-authentication.constants';

const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

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

function utcDayLockKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `wia-${y}-${m}-${day}`;
}

function formatWalkInAuthSku(ref: Date, sequence: number): string {
  const y = ref.getUTCFullYear();
  const mm = String(ref.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(ref.getUTCDate()).padStart(2, '0');
  const seq =
    sequence < 100 ? String(sequence).padStart(2, '0') : String(sequence);
  return `WIA-${y}-${mm}${dd}-${seq}`;
}

function formatEmployeeName(
  e: Pick<Employee, 'firstName' | 'lastName'> | null | undefined,
): string | null {
  if (!e) return null;
  const name = [e.firstName, e.lastName].filter(Boolean).join(' ').trim();
  return name.length > 0 ? name : null;
}

function isAuthenticatorPosition(position: string): boolean {
  return position.trim().toLowerCase() === 'authenticator';
}

function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m === 'image/jpeg') return 'jpg';
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/gif') return 'gif';
  if (m === 'application/pdf') return 'pdf';
  return 'bin';
}

function parseImageDataUrl(
  dataUrl: string,
): { buffer: Buffer; mime: string } | null {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl.trim());
  if (!m) return null;
  const mime = m[1].toLowerCase();
  if (!ALLOWED_IMAGE_MIMES.has(mime)) return null;
  try {
    const buffer = Buffer.from(m[2], 'base64');
    if (buffer.length === 0 || buffer.length > MAX_PHOTO_BYTES) return null;
    return { buffer, mime };
  } catch {
    return null;
  }
}

function parsePaymentAmount(raw: string): string {
  const cleaned = String(raw ?? '')
    .trim()
    .replace(/,/g, '')
    .replace(/^\u20b1\s?/i, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) {
    throw new BadRequestException('Enter a valid payment amount.');
  }
  return n.toFixed(2);
}

function normalizeOptionalText(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  return trimmed === '' ? null : trimmed;
}

function parseOptionalMoney(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, '').replace(/^\u20b1\s?/i, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function applyAuthDetails(
  row: WalkInAuthentication,
  dto: WalkInAuthDetailsDto,
): void {
  if (dto.dimensions !== undefined) {
    row.dimensions = normalizeOptionalText(dto.dimensions);
  }
  if (dto.marketResearchNotes !== undefined) {
    row.marketResearchNotes = normalizeOptionalText(dto.marketResearchNotes);
  }
  if (dto.marketResearchLink !== undefined) {
    row.marketResearchLink = normalizeOptionalText(dto.marketResearchLink);
  }
  if (dto.authenticatorNotes !== undefined) {
    row.authenticatorNotes = normalizeOptionalText(dto.authenticatorNotes);
  }
  if (dto.marketPrice !== undefined) {
    const trimmed = String(dto.marketPrice).trim();
    if (trimmed === '') {
      row.marketPrice = null;
    } else {
      const parsed = parseOptionalMoney(trimmed);
      if (parsed == null) throw new BadRequestException('Invalid market price.');
      row.marketPrice = parsed.toFixed(2);
    }
  }
  if (dto.retailPrice !== undefined) {
    const trimmed = String(dto.retailPrice).trim();
    if (trimmed === '') {
      row.retailPrice = null;
    } else {
      const parsed = parseOptionalMoney(trimmed);
      if (parsed == null) throw new BadRequestException('Invalid retail price.');
      row.retailPrice = parsed.toFixed(2);
    }
  }
}

function normalizeThirdParty(
  raw:
    | {
        selectedAuthenticator?: unknown;
        certificateLink?: unknown;
        notes?: unknown;
      }
    | null
    | undefined,
): ThirdPartyAuthenticationData | null {
  if (!raw || typeof raw !== 'object') return null;
  const selectedAuthenticator =
    raw.selectedAuthenticator === 'LegitGrails' ||
    raw.selectedAuthenticator === 'Entrupy'
      ? raw.selectedAuthenticator
      : null;
  const certificateLink =
    typeof raw.certificateLink === 'string' && raw.certificateLink.trim() !== ''
      ? raw.certificateLink.trim()
      : null;
  const notes =
    typeof raw.notes === 'string' && raw.notes.trim() !== ''
      ? raw.notes.trim()
      : null;
  if (
    selectedAuthenticator == null &&
    certificateLink == null &&
    notes == null
  ) {
    return null;
  }
  return { selectedAuthenticator, certificateLink, notes };
}

export type WalkInAuthListRow = {
  id: string;
  sku: string;
  branch: string;
  clientName: string;
  itemLabel: string;
  brand: string;
  category: string;
  paymentAmount: string;
  status: string;
  result: string | null;
  salesAssociateName: string | null;
  assignedToName: string | null;
  assignedToId: string | null;
  createdAt: string;
};

@Injectable()
export class WalkInAuthenticationService {
  constructor(
    @InjectRepository(WalkInAuthentication)
    private readonly repo: Repository<WalkInAuthentication>,
    @InjectRepository(WalkInAuthenticationMetric)
    private readonly metricRepo: Repository<WalkInAuthenticationMetric>,
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
    private readonly media: MediaService,
  ) {}

  private async requireActorEmployee(userId: string): Promise<Employee> {
    const employee = await this.employeesRepo.findOne({ where: { userId } });
    if (!employee) {
      throw new BadRequestException(
        'Your account is not linked to an employee record.',
      );
    }
    return employee;
  }

  private async enforceAssigneeAccess(
    row: WalkInAuthentication,
    actor: { userId: string; isAdmin: boolean },
  ): Promise<void> {
    if (actor.isAdmin) return;
    const employee = await this.employeesRepo.findOne({
      where: { userId: actor.userId },
    });
    if (!row.assignedToId) {
      throw new ForbiddenException(
        'This inquiry must be assigned to an authenticator before editing.',
      );
    }
    if (!employee?.id || employee.id !== row.assignedToId) {
      throw new ForbiddenException(
        'Only the assigned authenticator can perform this action.',
      );
    }
  }

  async create(
    dto: CreateWalkInAuthenticationDto,
    proof: MulterFile | undefined,
    user: JwtUser,
  ): Promise<{ id: string; sku: string; status: string }> {
    if (!proof) {
      throw new BadRequestException('Proof of payment is required.');
    }
    const mime = proof.mimetype.toLowerCase();
    if (!ALLOWED_IMAGE_MIMES.has(mime) && mime !== 'application/pdf') {
      throw new BadRequestException(
        'Proof of payment must be an image or PDF.',
      );
    }

    const salesAssociate = await this.requireActorEmployee(user.userId);
    const paymentAmount = parsePaymentAmount(dto.paymentAmount);
    const refNow = new Date();

    const created = await this.repo.manager.transaction(async (em) => {
      await em.query(
        `SELECT pg_advisory_xact_lock(hashtext($1::text)::bigint)`,
        [utcDayLockKey(refNow)],
      );
      const bounds = utcDayRange(refNow);
      const countToday = await em.count(WalkInAuthentication, {
        where: { createdAt: Between(bounds.start, bounds.end) },
      });
      const sku = formatWalkInAuthSku(refNow, countToday + 1);

      const row = em.create(WalkInAuthentication, {
        sku,
        branch: dto.branch,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        contactNumber: dto.contactNumber.trim(),
        email: dto.email.trim().toLowerCase(),
        itemModel: dto.itemModel.trim(),
        brand: dto.brand.trim(),
        category: dto.category.trim(),
        serialNumber: normalizeOptionalText(dto.serialNumber),
        color: normalizeOptionalText(dto.color),
        material: normalizeOptionalText(dto.material),
        inclusions: normalizeOptionalText(dto.inclusions),
        paymentAmount,
        salesAssociateId: salesAssociate.id,
        assignedToId: null,
        status: WALK_IN_AUTH_STATUS_PENDING,
        result: null,
        createdById: user.userId,
        updatedById: user.userId,
      });
      return em.save(row);
    });

    const ext = extFromMime(mime);
    await this.media.replaceSingle(
      MediaOwnerType.WALK_IN_AUTHENTICATION,
      created.id,
      MediaPurpose.PAYMENT_PROOF,
      proof,
      `walk-in-authentication/${created.id}/payment-proof/${randomUUID()}.${ext}`,
      { uploadedByUserId: user.userId, createdById: user.userId },
    );

    return {
      id: created.id,
      sku: created.sku,
      status: created.status,
    };
  }

  async listAll(): Promise<WalkInAuthListRow[]> {
    const rows = await this.repo.find({
      relations: { salesAssociate: true, assignedTo: true },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      branch: r.branch,
      clientName: [r.firstName, r.lastName].filter(Boolean).join(' ').trim(),
      itemLabel: [r.brand, r.itemModel].filter(Boolean).join(' ').trim(),
      brand: r.brand,
      category: r.category,
      paymentAmount: r.paymentAmount,
      status: r.status,
      result: r.result,
      salesAssociateName: formatEmployeeName(r.salesAssociate),
      assignedToName: formatEmployeeName(r.assignedTo),
      assignedToId: r.assignedToId,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async listAuthenticators(): Promise<{ id: string; displayName: string }[]> {
    const rows = await this.employeesRepo
      .createQueryBuilder('e')
      .where('LOWER(TRIM(e.position)) = :p', { p: 'authenticator' })
      .orderBy('e.lastName', 'ASC')
      .addOrderBy('e.firstName', 'ASC')
      .getMany();
    return rows.map((e) => ({
      id: e.id,
      displayName: formatEmployeeName(e) ?? e.email,
    }));
  }

  async batchAssign(
    dto: BatchAssignWalkInAuthenticatorDto,
    actor: JwtUser,
  ): Promise<{ updated: number }> {
    const actorEmployee = await this.employeesRepo.findOne({
      where: { userId: actor.userId },
    });
    if (!canAssignWorkToOthers(actor.isAdmin, actorEmployee?.position)) {
      if (!actorEmployee?.id) {
        throw new ForbiddenException(
          'Your account is not linked to an employee record.',
        );
      }
      if (actorEmployee.id !== dto.employeeId) {
        throw new ForbiddenException(
          'Only a supervisor can assign authentication to other staff.',
        );
      }
    }
    const employee = await this.employeesRepo.findOne({
      where: { id: dto.employeeId },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    if (!isAuthenticatorPosition(employee.position)) {
      throw new BadRequestException(
        actorEmployee?.id === dto.employeeId
          ? 'You must be in the Authenticator position to assign items to yourself.'
          : 'Selected person is not in the Authenticator position.',
      );
    }

    const uniqueIds = [...new Set(dto.ids)];
    await this.repo.manager.transaction(async (em) => {
      for (const id of uniqueIds) {
        const row = await em.findOne(WalkInAuthentication, { where: { id } });
        if (!row) {
          throw new NotFoundException(`Walk-in authentication ${id} not found`);
        }
        if (row.status === WALK_IN_AUTH_STATUS_COMPLETED) {
          throw new BadRequestException(
            `${row.sku} is already completed and cannot be reassigned.`,
          );
        }
        row.assignedToId = dto.employeeId;
        row.status = WALK_IN_AUTH_STATUS_ASSIGNED;
        row.updatedById = actor.userId;
        await em.save(row);
      }
    });
    return { updated: uniqueIds.length };
  }

  async findOne(id: string) {
    const row = await this.repo.findOne({
      where: { id },
      relations: { salesAssociate: true, assignedTo: true },
    });
    if (!row) throw new NotFoundException('Walk-in authentication not found');

    const metricRows = await this.metricRepo.find({
      where: { walkInAuthenticationId: id },
    });

    const paymentProof = this.media.toKeyUrlList(
      await this.media.findByOwner(
        MediaOwnerType.WALK_IN_AUTHENTICATION,
        id,
        { purpose: MediaPurpose.PAYMENT_PROOF, orderBySort: true },
      ),
    );
    const certificatePhotos = this.media.toUrlList(
      await this.media.findByOwner(
        MediaOwnerType.WALK_IN_AUTHENTICATION,
        id,
        { purpose: MediaPurpose.CERTIFICATE, orderBySort: true },
      ),
    );

    const metricIds = metricRows.map((m) => m.id);
    const photosByMetricId = new Map<string, string[]>();
    if (metricIds.length > 0) {
      for (const metricId of metricIds) {
        photosByMetricId.set(
          metricId,
          this.media.toUrlList(
            await this.media.findByOwner(
              MediaOwnerType.WALK_IN_AUTHENTICATION_METRIC,
              metricId,
              { purpose: MediaPurpose.AUTH_METRIC, orderBySort: true },
            ),
          ),
        );
      }
    }

    const tp = row.thirdPartyAuthenticationData;

    return {
      id: row.id,
      sku: row.sku,
      branch: row.branch,
      firstName: row.firstName,
      lastName: row.lastName,
      contactNumber: row.contactNumber,
      email: row.email,
      itemModel: row.itemModel,
      brand: row.brand,
      category: row.category,
      serialNumber: row.serialNumber,
      color: row.color,
      material: row.material,
      inclusions: row.inclusions,
      paymentAmount: row.paymentAmount,
      paymentProof,
      status: row.status,
      result: row.result,
      salesAssociateId: row.salesAssociateId,
      salesAssociateName: formatEmployeeName(row.salesAssociate),
      assignedToId: row.assignedToId,
      assignedToName: formatEmployeeName(row.assignedTo),
      dimensions: row.dimensions,
      marketPrice: row.marketPrice,
      retailPrice: row.retailPrice,
      marketResearchNotes: row.marketResearchNotes,
      marketResearchLink: row.marketResearchLink,
      authenticatorNotes: row.authenticatorNotes,
      thirdPartyAuthentication: {
        selectedAuthenticator: tp?.selectedAuthenticator ?? null,
        certificateLink: tp?.certificateLink ?? null,
        certificatePhotos,
        notes: tp?.notes ?? null,
      },
      metrics: metricRows.map((m) => ({
        id: m.id,
        authenticationMetricId: m.authenticationMetricId,
        notes: m.notes,
        metricStatus: m.metricStatus,
        photos: photosByMetricId.get(m.id) ?? [],
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async save(
    id: string,
    dto: SaveWalkInAuthenticationDto,
    actor: { userId: string; isAdmin: boolean },
  ): Promise<{ saved: boolean }> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Walk-in authentication not found');
    if (row.status !== WALK_IN_AUTH_STATUS_ASSIGNED) {
      throw new BadRequestException(
        'Only assigned walk-in authentications can be edited.',
      );
    }
    await this.enforceAssigneeAccess(row, actor);

    type MetricPhotoSync = { metricRowId: string; photos: string[] };
    const metricPhotoSyncs: MetricPhotoSync[] = [];
    let certificatePhotosToSync: string[] | null = null;

    await this.repo.manager.transaction(async (em) => {
      const locked = await em.findOne(WalkInAuthentication, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) {
        throw new NotFoundException('Walk-in authentication not found');
      }

      if (dto.itemSnapshot) {
        const snap = dto.itemSnapshot;
        if (snap.itemModel !== undefined) {
          const v = snap.itemModel.trim();
          if (!v) throw new BadRequestException('Item model is required.');
          locked.itemModel = v;
        }
        if (snap.brand !== undefined) {
          const v = snap.brand.trim();
          if (!v) throw new BadRequestException('Brand is required.');
          locked.brand = v;
        }
        if (snap.category !== undefined) {
          const v = snap.category.trim();
          if (!v) throw new BadRequestException('Category is required.');
          locked.category = v;
        }
        if (snap.serialNumber !== undefined) {
          locked.serialNumber = normalizeOptionalText(snap.serialNumber);
        }
        if (snap.color !== undefined) {
          locked.color = normalizeOptionalText(snap.color);
        }
        if (snap.material !== undefined) {
          locked.material = normalizeOptionalText(snap.material);
        }
        if (snap.inclusions !== undefined) {
          locked.inclusions = normalizeOptionalText(snap.inclusions);
        }
      }

      if (dto.authenticationDetails) {
        applyAuthDetails(locked, dto.authenticationDetails);
      }
      if (dto.thirdPartyAuthentication !== undefined) {
        locked.thirdPartyAuthenticationData = normalizeThirdParty(
          dto.thirdPartyAuthentication,
        );
        if (dto.thirdPartyAuthentication.certificatePhotos !== undefined) {
          certificatePhotosToSync =
            dto.thirdPartyAuthentication.certificatePhotos === null
              ? []
              : Array.isArray(dto.thirdPartyAuthentication.certificatePhotos)
                ? dto.thirdPartyAuthentication.certificatePhotos
                : [];
        }
      }

      locked.updatedById = actor.userId;
      await em.save(locked);

      for (const entry of dto.rows ?? []) {
        const notes = normalizeOptionalText(entry.notes);
        let existing = await em.findOne(WalkInAuthenticationMetric, {
          where: {
            walkInAuthenticationId: id,
            authenticationMetricId: entry.authenticationMetricId,
          },
        });
        if (!existing) {
          existing = em.create(WalkInAuthenticationMetric, {
            walkInAuthenticationId: id,
            authenticationMetricId: entry.authenticationMetricId,
            notes,
            metricStatus: entry.metricStatus ?? null,
          });
        } else {
          existing.notes = notes;
          existing.metricStatus = entry.metricStatus ?? null;
        }
        await em.save(existing);

        if (entry.photos !== undefined) {
          metricPhotoSyncs.push({
            metricRowId: existing.id,
            photos:
              entry.photos === null
                ? []
                : Array.isArray(entry.photos)
                  ? entry.photos
                  : [],
          });
        }
      }
    });

    if (certificatePhotosToSync !== null) {
      await this.media.syncPhotoPayload(
        MediaOwnerType.WALK_IN_AUTHENTICATION,
        id,
        MediaPurpose.CERTIFICATE,
        certificatePhotosToSync,
        {
          keyForNewUpload: (index, mime) =>
            `walk-in-authentication/${id}/certificate/${index}-${randomUUID()}.${extFromMime(mime)}`,
          parseDataUrl: parseImageDataUrl,
          uploadedByUserId: actor.userId,
          createdById: actor.userId,
        },
      );
    }

    for (const sync of metricPhotoSyncs) {
      await this.media.syncPhotoPayload(
        MediaOwnerType.WALK_IN_AUTHENTICATION_METRIC,
        sync.metricRowId,
        MediaPurpose.AUTH_METRIC,
        sync.photos,
        {
          keyForNewUpload: (index, mime) =>
            `walk-in-authentication-metrics/${sync.metricRowId}/${index}-${randomUUID()}.${extFromMime(mime)}`,
          parseDataUrl: parseImageDataUrl,
          uploadedByUserId: actor.userId,
          createdById: actor.userId,
        },
      );
    }

    return { saved: true };
  }

  async complete(
    id: string,
    dto: CompleteWalkInAuthenticationDto,
    actor: { userId: string; isAdmin: boolean },
  ): Promise<{ status: string; result: string }> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Walk-in authentication not found');
    if (row.status !== WALK_IN_AUTH_STATUS_ASSIGNED) {
      throw new BadRequestException(
        'Only assigned walk-in authentications can be marked as done.',
      );
    }
    await this.enforceAssigneeAccess(row, actor);

    row.result = dto.result;
    row.status = WALK_IN_AUTH_STATUS_COMPLETED;
    row.updatedById = actor.userId;
    await this.repo.save(row);

    return { status: row.status, result: row.result };
  }
}
