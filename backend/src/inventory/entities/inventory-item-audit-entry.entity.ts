import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { InventoryItem } from './inventory-item.entity';

@Entity('inventory_item_audit_entries')
export class InventoryItemAuditEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'inventory_item_id', type: 'uuid' })
  inventoryItemId: string;

  @ManyToOne(() => InventoryItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inventory_item_id' })
  inventoryItem: InventoryItem;

  /** Human-readable field name (e.g. "Status", "Authentication: Assigned to"). */
  @Column({ name: 'property_name', length: 512 })
  propertyName: string;

  @Column({ name: 'from_value', type: 'text', nullable: true })
  fromValue: string | null;

  @Column({ name: 'to_value', type: 'text', nullable: true })
  toValue: string | null;

  @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true })
  updatedByUserId: string | null;

  /** Display name at time of change (staff name, "Customer", or "System"). */
  @Column({ name: 'updated_by_label', length: 255 })
  updatedByLabel: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
