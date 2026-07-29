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

@Entity('promotions')
export class Promotion extends AuditedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'promotion_name', type: 'varchar', length: 255 })
  promotionName: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'date' })
  endDate: Date;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @OneToMany(() => PromotionItem, (row) => row.promotion)
  items: PromotionItem[];
}

@Entity('promotion_items')
export class PromotionItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'promotion_id', type: 'uuid' })
  promotionId: string;

  @ManyToOne(() => Promotion, (p) => p.items, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'promotion_id' })
  promotion: Promotion;

  @Column({ name: 'inventory_item_id', type: 'uuid' })
  inventoryItemId: string;

  @ManyToOne(() => InventoryItem, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'inventory_item_id' })
  inventoryItem: InventoryItem;

  @Column({
    name: 'promo_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  promoPrice: string | null;
}
