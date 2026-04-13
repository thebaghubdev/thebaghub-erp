import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { AuditedEntity } from '../../common/entities/audited.entity';
import { InquiryStatus } from '../../enums/inquiry-status.enum';

/** Stored snapshot for the single item on this inquiry row. */
export type InquiryItemImage = { key: string; url: string };

export type InquiryItemSnapshot = {
  clientItemId: string;
  form: Record<string, unknown>;
  images: InquiryItemImage[];
};

@Entity('inquiries')
export class Inquiry extends AuditedEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'consignor_id', type: 'uuid' })
  consignorId: string;

  @ManyToOne(() => Client, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'consignor_id' })
  consignor: Client;

  /** e.g. INQ-2026-0413-01 — date + daily sequence (UTC). */
  @Column({ length: 48, unique: true })
  sku: string;

  @Column({
    type: 'enum',
    enum: InquiryStatus,
    default: InquiryStatus.PENDING,
  })
  status: InquiryStatus;

  /** One line item per inquiry row (form + uploaded image locations). */
  @Column({ type: 'jsonb', name: 'item_snapshot' })
  itemSnapshot: InquiryItemSnapshot;
}
