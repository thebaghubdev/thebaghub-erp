import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditedEntity } from '../../common/entities/audited.entity';
import { InventoryItem } from './inventory-item.entity';

@Entity('item_posting')
export class ItemPosting extends AuditedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'inventory_item_id', type: 'uuid', unique: true })
  inventoryItemId: string;

  @OneToOne(() => InventoryItem, (item) => item.itemPosting, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'inventory_item_id' })
  inventoryItem: InventoryItem;

  @Column({ name: 'posting_date', type: 'timestamptz', nullable: true })
  postingDate: Date | null;

  @Column({ name: 'product_name', type: 'varchar', length: 255 })
  productName: string;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  collections: string[];

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags: string[];

  @Column({
    name: 'price_comparison',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  priceComparison: string | null;

  @Column({ name: 'product_description', type: 'text', nullable: true })
  productDescription: string | null;

  @Column({ name: 'selected_photos_snapshot', type: 'jsonb' })
  selectedPhotosSnapshot: Array<Record<string, unknown>>;
}
