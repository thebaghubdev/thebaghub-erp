import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditedEntity } from '../../common/entities/audited.entity';
import { InventoryItem } from '../../inventory/entities/inventory-item.entity';

@Entity('logistics')
export class Logistics extends AuditedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128 })
  status: string;

  @Column({ name: 'transfer_date', type: 'date' })
  transferDate: Date;

  @Column({ name: 'sending_branch', type: 'varchar', length: 32 })
  sendingBranch: string;

  @Column({ name: 'receiving_branch', type: 'varchar', length: 32 })
  receivingBranch: string;

  @Column({ name: 'mode_of_transfer', type: 'varchar', length: 64 })
  modeOfTransfer: string;

  @Column({ name: 'reason_for_transfer', type: 'text' })
  reasonForTransfer: string;

  @Column({ name: 'tracking_name', type: 'varchar', length: 255 })
  trackingName: string;

  @Column({ name: 'tracking_number', type: 'varchar', length: 255 })
  trackingNumber: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => LogisticsItem, (row) => row.logistics)
  items: LogisticsItem[];
}

@Entity('logistics_items')
export class LogisticsItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'inventory_item_id', type: 'uuid' })
  inventoryItemId: string;

  @ManyToOne(() => InventoryItem, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'inventory_item_id' })
  inventoryItem: InventoryItem;

  @Column({ name: 'logistics_id', type: 'uuid' })
  logisticsId: string;

  @ManyToOne(() => Logistics, (l) => l.items, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'logistics_id' })
  logistics: Logistics;
}
