import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditedEntity } from '../../common/entities/audited.entity';
import { MediaOwnerType } from '../../enums/media-owner-type.enum';
import { MediaPurpose } from '../../enums/media-purpose.enum';

@Entity('media')
@Index('idx_media_owner', ['ownerType', 'ownerId'])
@Index('idx_media_owner_purpose', ['ownerType', 'ownerId', 'purpose'])
@Index('idx_media_storage_key', ['storageKey'])
export class Media extends AuditedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** S3 object key — canonical identifier for the stored file. */
  @Column({ name: 'storage_key', type: 'varchar', length: 512 })
  storageKey: string;

  /** Public URL for browser display (derived from storage key at upload time). */
  @Column({ type: 'varchar', length: 1024 })
  url: string;

  @Column({ name: 'content_type', type: 'varchar', length: 64 })
  contentType: string;

  @Column({ name: 'byte_size', type: 'bigint', nullable: true })
  byteSize: string | null;

  @Column({
    name: 'original_filename',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  originalFilename: string | null;

  @Column({ name: 'owner_type', type: 'varchar', length: 64 })
  ownerType: MediaOwnerType;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @Column({ type: 'varchar', length: 64 })
  purpose: MediaPurpose;

  /** Gallery ordering within an owner + purpose group. */
  @Column({ name: 'sort_order', type: 'int', nullable: true })
  sortOrder: number | null;

  @Column({ name: 'uploaded_by_user_id', type: 'uuid', nullable: true })
  uploadedByUserId: string | null;

  /** Extra context (e.g. clientItemId, metric id, installment number). */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;
}
