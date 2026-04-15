import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { AuditedEntity } from '../../common/entities/audited.entity';
import { Inquiry, type InquiryItemSnapshot } from '../../inquiries/entities/inquiry.entity';

/**
 * Physical inventory line received from consignment flow (distinct from inquiry SKU).
 * Table name avoids SQL `inventory` reserved-word issues.
 */
@Entity('inventory_items')
export class InventoryItem extends AuditedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Daily sequence SKU without INQ prefix — e.g. 2026-0414-01 (UTC date + sequence).
   */
  @Column({ length: 48, unique: true })
  sku: string;

  @Column({ name: 'date_received', type: 'timestamptz' })
  dateReceived: Date;

  @Column({ name: 'inquiry_id', type: 'uuid', nullable: true })
  inquiryId: string | null;

  @ManyToOne(() => Inquiry, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'inquiry_id' })
  inquiry: Inquiry | null;

  @Column({ name: 'consignor_id', type: 'uuid', nullable: true })
  consignorId: string | null;

  @ManyToOne(() => Client, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'consignor_id' })
  consignor: Client | null;

  @Column({ type: 'varchar', length: 128 })
  status: string;

  @Column({ name: 'transaction_type', type: 'varchar', length: 32, nullable: true })
  transactionType: string | null;

  @Column({ name: 'current_branch', type: 'varchar', length: 32 })
  currentBranch: string;

  @Column({ name: 'item_snapshot', type: 'jsonb' })
  itemSnapshot: InquiryItemSnapshot;
}
