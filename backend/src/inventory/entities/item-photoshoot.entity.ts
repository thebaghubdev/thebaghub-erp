import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  RelationId,
} from 'typeorm';
import { AuditedEntity } from '../../common/entities/audited.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { InventoryItem } from './inventory-item.entity';

@Entity('item_photoshoot')
export class ItemPhotoshoot extends AuditedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => InventoryItem, (inv) => inv.itemPhotoshoot, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'inventory_item_id' })
  inventoryItem: InventoryItem;

  @RelationId((p: ItemPhotoshoot) => p.inventoryItem)
  inventoryItemId: string;

  @Column({ name: 'employee_id', type: 'uuid', nullable: true })
  employeeId: string | null;

  @ManyToOne(() => Employee, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'employee_id' })
  photographer: Employee | null;

  @Column({ name: 'photoshoot_date', type: 'date' })
  photoshootDate: Date;

  @Column({ name: 'photos_snapshot', type: 'jsonb', nullable: true })
  photosSnapshot: Record<string, unknown> | null;
}
