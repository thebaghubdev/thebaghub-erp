import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MediaOwnerType } from '../enums/media-owner-type.enum';
import { MediaPurpose } from '../enums/media-purpose.enum';
import { Media } from './entities/media.entity';
import {
  MediaKeyUrl,
  MediaKeyUrlPosition,
  UploadFileInput,
} from './media.types';
import { S3StorageService } from './s3-storage.service';

export type CreateMediaInput = {
  storageKey: string;
  contentType: string;
  byteSize?: number | null;
  originalFilename?: string | null;
  ownerType: MediaOwnerType;
  ownerId: string;
  purpose: MediaPurpose;
  sortOrder?: number | null;
  uploadedByUserId?: string | null;
  createdById?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type FindMediaOptions = {
  purpose?: MediaPurpose | MediaPurpose[];
  metadata?: Record<string, unknown>;
  orderBySort?: boolean;
};

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(Media)
    private readonly mediaRepo: Repository<Media>,
    private readonly s3: S3StorageService,
  ) {}

  resolveUrl(media: Pick<Media, 'storageKey' | 'url'>): string {
    return this.s3.getPublicUrl(media.storageKey);
  }

  toKeyUrl(media: Media): MediaKeyUrl {
    return { key: media.storageKey, url: this.resolveUrl(media) };
  }

  toKeyUrlList(media: Media[]): MediaKeyUrl[] {
    return media.map((row) => this.toKeyUrl(row));
  }

  toKeyUrlPositionList(media: Media[]): MediaKeyUrlPosition[] {
    return media.map((row) => ({
      key: row.storageKey,
      url: this.resolveUrl(row),
      position: row.sortOrder,
    }));
  }

  toUrlList(media: Media[]): string[] {
    return media.map((row) => this.resolveUrl(row));
  }

  async create(input: CreateMediaInput): Promise<Media> {
    const row = this.mediaRepo.create({
      storageKey: input.storageKey,
      url: this.s3.getPublicUrl(input.storageKey),
      contentType: input.contentType,
      byteSize: input.byteSize != null ? String(input.byteSize) : null,
      originalFilename: input.originalFilename ?? null,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      purpose: input.purpose,
      sortOrder: input.sortOrder ?? null,
      uploadedByUserId: input.uploadedByUserId ?? null,
      createdById: input.createdById ?? input.uploadedByUserId ?? null,
      metadata: input.metadata ?? null,
    });
    return this.mediaRepo.save(row);
  }

  async uploadFile(
    file: UploadFileInput,
    storageKey: string,
    params: Omit<
      CreateMediaInput,
      'storageKey' | 'contentType' | 'byteSize' | 'originalFilename'
    >,
  ): Promise<Media> {
    const contentType = file.mimetype.toLowerCase();
    await this.s3.putObject(storageKey, file.buffer, contentType);
    return this.create({
      storageKey,
      contentType,
      byteSize: file.size ?? file.buffer.length,
      originalFilename: file.originalname ?? null,
      ...params,
    });
  }

  async uploadDataUrl(
    storageKey: string,
    params: Omit<
      CreateMediaInput,
      'storageKey' | 'contentType' | 'byteSize' | 'originalFilename'
    >,
    parsed: { buffer: Buffer; mime: string },
  ): Promise<Media> {
    await this.s3.putObject(storageKey, parsed.buffer, parsed.mime);
    return this.create({
      storageKey,
      contentType: parsed.mime,
      byteSize: parsed.buffer.length,
      ...params,
    });
  }

  async findById(id: string): Promise<Media | null> {
    return this.mediaRepo.findOne({ where: { id } });
  }

  async findByStorageKey(storageKey: string): Promise<Media | null> {
    return this.mediaRepo.findOne({ where: { storageKey } });
  }

  private applyMetadataFilter(
    qb: ReturnType<Repository<Media>['createQueryBuilder']>,
    metadata?: Record<string, unknown>,
  ): void {
    if (!metadata || Object.keys(metadata).length === 0) return;
    qb.andWhere('media.metadata @> :metadata::jsonb', {
      metadata: JSON.stringify(metadata),
    });
  }

  async findByOwners(
    ownerType: MediaOwnerType,
    ownerIds: string[],
    options: FindMediaOptions = {},
  ): Promise<Media[]> {
    if (ownerIds.length === 0) return [];
    const purposeFilter = options.purpose
      ? Array.isArray(options.purpose)
        ? In(options.purpose)
        : options.purpose
      : undefined;
    return this.mediaRepo.find({
      where: {
        ownerType,
        ownerId: In(ownerIds),
        ...(purposeFilter !== undefined ? { purpose: purposeFilter } : {}),
      },
      order: options.orderBySort
        ? { sortOrder: 'ASC', createdAt: 'ASC' }
        : { createdAt: 'ASC' },
    });
  }

  async findByOwner(
    ownerType: MediaOwnerType,
    ownerId: string,
    options: FindMediaOptions = {},
  ): Promise<Media[]> {
    const purposeFilter = options.purpose
      ? Array.isArray(options.purpose)
        ? In(options.purpose)
        : options.purpose
      : undefined;

    if (options.metadata && Object.keys(options.metadata).length > 0) {
      const qb = this.mediaRepo
        .createQueryBuilder('media')
        .where('media.owner_type = :ownerType', { ownerType })
        .andWhere('media.owner_id = :ownerId', { ownerId });
      if (purposeFilter !== undefined) {
        if (Array.isArray(options.purpose)) {
          qb.andWhere('media.purpose IN (:...purposes)', {
            purposes: options.purpose,
          });
        } else {
          qb.andWhere('media.purpose = :purpose', { purpose: options.purpose });
        }
      }
      this.applyMetadataFilter(qb, options.metadata);
      qb.orderBy(
        options.orderBySort ? 'media.sort_order' : 'media.created_at',
        'ASC',
      );
      if (options.orderBySort) {
        qb.addOrderBy('media.created_at', 'ASC');
      }
      return qb.getMany();
    }

    return this.mediaRepo.find({
      where: {
        ownerType,
        ownerId,
        ...(purposeFilter !== undefined ? { purpose: purposeFilter } : {}),
      },
      order: options.orderBySort
        ? { sortOrder: 'ASC', createdAt: 'ASC' }
        : { createdAt: 'ASC' },
    });
  }

  async countByOwner(
    ownerType: MediaOwnerType,
    ownerId: string,
    purpose?: MediaPurpose,
    metadata?: Record<string, unknown>,
  ): Promise<number> {
    if (metadata && Object.keys(metadata).length > 0) {
      const qb = this.mediaRepo
        .createQueryBuilder('media')
        .where('media.owner_type = :ownerType', { ownerType })
        .andWhere('media.owner_id = :ownerId', { ownerId });
      if (purpose) {
        qb.andWhere('media.purpose = :purpose', { purpose });
      }
      this.applyMetadataFilter(qb, metadata);
      return qb.getCount();
    }
    return this.mediaRepo.count({
      where: {
        ownerType,
        ownerId,
        ...(purpose ? { purpose } : {}),
      },
    });
  }

  async countByOwners(
    ownerType: MediaOwnerType,
    ownerIds: string[],
    purpose: MediaPurpose,
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (ownerIds.length === 0) return counts;
    const rows = await this.mediaRepo
      .createQueryBuilder('media')
      .select('media.owner_id', 'ownerId')
      .addSelect('COUNT(*)', 'count')
      .where('media.owner_type = :ownerType', { ownerType })
      .andWhere('media.owner_id IN (:...ownerIds)', { ownerIds })
      .andWhere('media.purpose = :purpose', { purpose })
      .groupBy('media.owner_id')
      .getRawMany<{ ownerId: string; count: string }>();
    for (const row of rows) {
      counts.set(row.ownerId, Number(row.count));
    }
    return counts;
  }

  async findFirstUrl(
    ownerType: MediaOwnerType,
    ownerId: string,
    purpose: MediaPurpose,
    metadata?: Record<string, unknown>,
  ): Promise<string | null> {
    const rows = await this.findByOwner(ownerType, ownerId, {
      purpose,
      metadata,
      orderBySort: true,
    });
    return rows[0] ? this.resolveUrl(rows[0]) : null;
  }

  async hasMedia(
    ownerType: MediaOwnerType,
    ownerId: string,
    purpose: MediaPurpose,
    metadata?: Record<string, unknown>,
  ): Promise<boolean> {
    const count = await this.countByOwner(
      ownerType,
      ownerId,
      purpose,
      metadata,
    );
    return count > 0;
  }

  async deleteByOwner(
    ownerType: MediaOwnerType,
    ownerId: string,
    purpose?: MediaPurpose,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (metadata && Object.keys(metadata).length > 0) {
      const qb = this.mediaRepo
        .createQueryBuilder()
        .delete()
        .where('owner_type = :ownerType', { ownerType })
        .andWhere('owner_id = :ownerId', { ownerId });
      if (purpose) {
        qb.andWhere('purpose = :purpose', { purpose });
      }
      qb.andWhere('metadata @> :metadata::jsonb', {
        metadata: JSON.stringify(metadata),
      });
      await qb.execute();
      return;
    }
    await this.mediaRepo.delete({
      ownerType,
      ownerId,
      ...(purpose ? { purpose } : {}),
    });
  }

  async replaceSingle(
    ownerType: MediaOwnerType,
    ownerId: string,
    purpose: MediaPurpose,
    file: UploadFileInput,
    storageKey: string,
    params: {
      uploadedByUserId?: string | null;
      createdById?: string | null;
      metadata?: Record<string, unknown> | null;
    } = {},
  ): Promise<Media> {
    await this.deleteByOwner(
      ownerType,
      ownerId,
      purpose,
      params.metadata ?? undefined,
    );
    return this.uploadFile(file, storageKey, {
      ownerType,
      ownerId,
      purpose,
      sortOrder: 0,
      uploadedByUserId: params.uploadedByUserId ?? null,
      createdById: params.createdById ?? null,
      metadata: params.metadata ?? null,
    });
  }

  async appendFiles(
    ownerType: MediaOwnerType,
    ownerId: string,
    purpose: MediaPurpose,
    files: UploadFileInput[],
    keyForFile: (index: number, file: UploadFileInput) => string,
    params: {
      uploadedByUserId?: string | null;
      createdById?: string | null;
      metadata?: Record<string, unknown> | null;
      startSortOrder?: number;
    } = {},
  ): Promise<Media[]> {
    const existingCount = await this.countByOwner(
      ownerType,
      ownerId,
      purpose,
      params.metadata ?? undefined,
    );
    const startSort = params.startSortOrder ?? existingCount;
    const created: Media[] = [];
    for (let i = 0; i < files.length; i++) {
      created.push(
        await this.uploadFile(files[i], keyForFile(i, files[i]), {
          ownerType,
          ownerId,
          purpose,
          sortOrder: startSort + i,
          uploadedByUserId: params.uploadedByUserId ?? null,
          createdById: params.createdById ?? null,
          metadata: params.metadata ?? null,
        }),
      );
    }
    return created;
  }

  async replaceGallery(
    ownerType: MediaOwnerType,
    ownerId: string,
    purpose: MediaPurpose,
    retainedKeys: string[],
    newFiles: UploadFileInput[],
    keyForNewFile: (index: number, file: UploadFileInput) => string,
    params: {
      uploadedByUserId?: string | null;
      createdById?: string | null;
      metadata?: Record<string, unknown> | null;
    } = {},
  ): Promise<MediaKeyUrl[]> {
    const existing = await this.findByOwner(ownerType, ownerId, {
      purpose,
      metadata: params.metadata ?? undefined,
      orderBySort: true,
    });
    const existingByKey = new Map(existing.map((row) => [row.storageKey, row]));
    const retainedRows: Media[] = [];
    for (const key of retainedKeys) {
      const row = existingByKey.get(key);
      if (!row) {
        throw new Error(`Unknown image key: ${key}`);
      }
      retainedRows.push(row);
    }

    await this.deleteByOwner(
      ownerType,
      ownerId,
      purpose,
      params.metadata ?? undefined,
    );

    const saved: Media[] = [];
    for (let i = 0; i < retainedRows.length; i++) {
      const row = retainedRows[i];
      saved.push(
        await this.create({
          storageKey: row.storageKey,
          contentType: row.contentType,
          byteSize: row.byteSize != null ? Number(row.byteSize) : null,
          originalFilename: row.originalFilename,
          ownerType,
          ownerId,
          purpose,
          sortOrder: i,
          uploadedByUserId: params.uploadedByUserId ?? row.uploadedByUserId,
          createdById: params.createdById ?? row.createdById,
          metadata: params.metadata ?? row.metadata,
        }),
      );
    }

    for (let i = 0; i < newFiles.length; i++) {
      saved.push(
        await this.uploadFile(newFiles[i], keyForNewFile(i, newFiles[i]), {
          ownerType,
          ownerId,
          purpose,
          sortOrder: saved.length,
          uploadedByUserId: params.uploadedByUserId ?? null,
          createdById: params.createdById ?? null,
          metadata: params.metadata ?? null,
        }),
      );
    }

    return this.toKeyUrlList(saved);
  }

  async referenceExistingKeys(
    ownerType: MediaOwnerType,
    ownerId: string,
    purpose: MediaPurpose,
    entries: Array<{ key: string; position?: number | null }>,
    params: {
      uploadedByUserId?: string | null;
      createdById?: string | null;
      metadata?: Record<string, unknown> | null;
    } = {},
  ): Promise<MediaKeyUrlPosition[]> {
    await this.deleteByOwner(
      ownerType,
      ownerId,
      purpose,
      params.metadata ?? undefined,
    );
    const saved: Media[] = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const existing = await this.findByStorageKey(entry.key);
      saved.push(
        await this.create({
          storageKey: entry.key,
          contentType: existing?.contentType ?? 'image/jpeg',
          byteSize: existing?.byteSize != null ? Number(existing.byteSize) : null,
          originalFilename: existing?.originalFilename ?? null,
          ownerType,
          ownerId,
          purpose,
          sortOrder: entry.position ?? i,
          uploadedByUserId: params.uploadedByUserId ?? null,
          createdById: params.createdById ?? null,
          metadata: params.metadata ?? null,
        }),
      );
    }
    return this.toKeyUrlPositionList(saved);
  }

  async copyOwnerMedia(
    fromOwnerType: MediaOwnerType,
    fromOwnerId: string,
    toOwnerType: MediaOwnerType,
    toOwnerId: string,
    purpose: MediaPurpose,
  ): Promise<void> {
    const rows = await this.findByOwner(fromOwnerType, fromOwnerId, {
      purpose,
      orderBySort: true,
    });
    if (rows.length === 0) return;
    await this.deleteByOwner(toOwnerType, toOwnerId, purpose);
    for (const row of rows) {
      await this.create({
        storageKey: row.storageKey,
        contentType: row.contentType,
        byteSize: row.byteSize != null ? Number(row.byteSize) : null,
        originalFilename: row.originalFilename,
        ownerType: toOwnerType,
        ownerId: toOwnerId,
        purpose,
        sortOrder: row.sortOrder,
        uploadedByUserId: row.uploadedByUserId,
        createdById: row.createdById,
        metadata: row.metadata,
      });
    }
  }

  async replaceAllFromDataUrls(
    ownerType: MediaOwnerType,
    ownerId: string,
    purpose: MediaPurpose,
    dataUrls: string[],
    keyForIndex: (index: number, mime: string) => string,
    parseDataUrl: (dataUrl: string) => { buffer: Buffer; mime: string } | null,
    params: {
      uploadedByUserId?: string | null;
      createdById?: string | null;
      metadata?: Record<string, unknown> | null;
    } = {},
  ): Promise<Media[]> {
    await this.deleteByOwner(
      ownerType,
      ownerId,
      purpose,
      params.metadata ?? undefined,
    );
    const saved: Media[] = [];
    let sortOrder = 0;
    for (const raw of dataUrls) {
      const trimmed = String(raw).trim();
      if (trimmed === '') continue;
      const parsed = parseDataUrl(trimmed);
      if (!parsed) continue;
      saved.push(
        await this.uploadDataUrl(
          keyForIndex(sortOrder, parsed.mime),
          {
            ownerType,
            ownerId,
            purpose,
            sortOrder,
            uploadedByUserId: params.uploadedByUserId ?? null,
            createdById: params.createdById ?? null,
            metadata: params.metadata ?? null,
          },
          parsed,
        ),
      );
      sortOrder += 1;
    }
    return saved;
  }

  /** Replace owner media from mixed payloads: data URLs (upload), HTTPS URLs, or storage keys (reference). */
  async syncPhotoPayload(
    ownerType: MediaOwnerType,
    ownerId: string,
    purpose: MediaPurpose,
    payloads: string[],
    options: {
      keyForNewUpload: (index: number, mime: string) => string;
      parseDataUrl: (dataUrl: string) => { buffer: Buffer; mime: string } | null;
      uploadedByUserId?: string | null;
      createdById?: string | null;
      metadata?: Record<string, unknown> | null;
    },
  ): Promise<Media[]> {
    await this.deleteByOwner(
      ownerType,
      ownerId,
      purpose,
      options.metadata ?? undefined,
    );

    const saved: Media[] = [];
    let sortOrder = 0;

    for (const raw of payloads) {
      const trimmed = String(raw).trim();
      if (trimmed === '') continue;

      if (trimmed.startsWith('data:')) {
        const parsed = options.parseDataUrl(trimmed);
        if (!parsed) continue;
        saved.push(
          await this.uploadDataUrl(
            options.keyForNewUpload(sortOrder, parsed.mime),
            {
              ownerType,
              ownerId,
              purpose,
              sortOrder,
              uploadedByUserId: options.uploadedByUserId ?? null,
              createdById: options.createdById ?? null,
              metadata: options.metadata ?? null,
            },
            parsed,
          ),
        );
        sortOrder += 1;
        continue;
      }

      let storageKey: string | null = null;
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        try {
          const url = new URL(trimmed);
          storageKey = decodeURIComponent(url.pathname.replace(/^\//, ''));
        } catch {
          storageKey = null;
        }
      } else {
        storageKey = trimmed;
      }

      if (!storageKey) continue;

      const existing = await this.findByStorageKey(storageKey);
      saved.push(
        await this.create({
          storageKey,
          contentType: existing?.contentType ?? 'image/jpeg',
          byteSize: existing?.byteSize != null ? Number(existing.byteSize) : null,
          originalFilename: existing?.originalFilename ?? null,
          ownerType,
          ownerId,
          purpose,
          sortOrder,
          uploadedByUserId: options.uploadedByUserId ?? null,
          createdById: options.createdById ?? null,
          metadata: options.metadata ?? null,
        }),
      );
      sortOrder += 1;
    }

    return saved;
  }
}
